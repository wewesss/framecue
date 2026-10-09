import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { exitCodeOf, spawnPiped } from "./exec";
import { sha256File } from "./hash";
import { probeVideo } from "./probe";

export interface Peaks {
  rate: number;
  length: number;
  data: Int8Array;
}

export interface PcmProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: Promise<string>;
  exited: Promise<number>;
}

export type PcmSpawn = (cmd: string[]) => PcmProcess;

export interface PeaksOptions {
  rate?: number;
  workspace?: string;
  sha256?: string;
  spawn?: PcmSpawn;
}

export const DEFAULT_PEAKS_RATE = 200;
const SAMPLES_PER_BUCKET = 40;

const defaultSpawn: PcmSpawn = (cmd) => {
  const { child, failed } = spawnPiped(cmd);
  const stderr = new Promise<string>((done) => {
    const chunks: Buffer[] = [];
    child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.once("close", () => done(Buffer.concat(chunks).toString("utf8")));
  });
  const exited = Promise.race([exitCodeOf(child), failed]);
  exited.catch(() => undefined);
  return {
    stdout: Readable.toWeb(child.stdout as Readable) as unknown as ReadableStream<Uint8Array>,
    stderr,
    exited,
  };
};

function toInt8(sample: number): number {
  return Math.max(-127, Math.min(127, Math.round((sample / 32768) * 127)));
}

async function extract(videoPath: string, rate: number, spawn: PcmSpawn): Promise<Peaks | null> {
  const proc = spawn([
    "ffmpeg",
    "-v",
    "error",
    "-i",
    videoPath,
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(rate * SAMPLES_PER_BUCKET),
    "-f",
    "s16le",
    "-",
  ]);
  const out: number[] = [];
  let min = 127;
  let max = -127;
  let inBucket = 0;
  let carry: number | null = null;

  const push = (sample: number) => {
    const v = toInt8(sample);
    if (v < min) min = v;
    if (v > max) max = v;
    if (++inBucket === SAMPLES_PER_BUCKET) {
      out.push(min, max);
      min = 127;
      max = -127;
      inBucket = 0;
    }
  };

  const reader = proc.stdout.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let i = 0;
    if (carry !== null && value.length > 0) {
      push(((carry | ((value[0] as number) << 8)) << 16) >> 16);
      carry = null;
      i = 1;
    }
    for (; i + 1 < value.length; i += 2) {
      push((((value[i] as number) | ((value[i + 1] as number) << 8)) << 16) >> 16);
    }
    if (i < value.length) carry = value[i] as number;
  }
  if (inBucket > 0) out.push(min, max);

  const [code, stderr] = await Promise.all([proc.exited, proc.stderr]);
  if (code !== 0) {
    if ((await probeVideo(videoPath)).audio === null) return null;
    throw new Error(
      `ffmpeg failed (exit ${code}):\n${stderr.trim().split(/\r?\n/).slice(-15).join("\n")}`,
    );
  }
  if (out.length === 0) return null;
  return { rate, length: out.length / 2, data: Int8Array.from(out) };
}

export async function computePeaks(
  videoPath: string,
  { rate = DEFAULT_PEAKS_RATE, workspace, sha256, spawn = defaultSpawn }: PeaksOptions = {},
): Promise<Peaks | null> {
  let cacheFile: string | null = null;
  if (workspace) {
    const hash = sha256 ?? (await sha256File(videoPath));
    cacheFile = join(workspace, "cache", `peaks-${hash}-${rate}.bin`);
    const cached = await readFile(cacheFile).catch(() => null);
    if (cached) {
      const data = new Int8Array(cached.buffer, cached.byteOffset, cached.byteLength).slice();
      return { rate, length: data.length / 2, data };
    }
  }
  const peaks = await extract(videoPath, rate, spawn);
  if (peaks && cacheFile) {
    await mkdir(join(workspace as string, "cache"), { recursive: true });
    const tmp = `${cacheFile}.tmp`;
    await writeFile(tmp, peaks.data);
    await rename(tmp, cacheFile);
  }
  return peaks;
}
