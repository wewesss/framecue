import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpeg } from "./exec";

export interface Fixtures {
  dir: string;
  cfr: string;
  silent: string;
  vfr: string;
  cleanup: () => Promise<void>;
}

const VIDEO = ["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=25"];
const LIMIT = ["-t", "2"];
const AUDIO = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"];
const ENC = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "10"];

export async function makeFixtures(): Promise<Fixtures> {
  const dir = join(tmpdir(), `framecue-test-${Math.random().toString(36).slice(2, 10)}`);
  await mkdir(dir, { recursive: true });
  const cfr = join(dir, "cfr.mp4");
  const silent = join(dir, "silent.mp4");
  const vfr = join(dir, "vfr.mp4");
  await runFfmpeg([...VIDEO, ...AUDIO, ...ENC, "-c:a", "aac", ...LIMIT, cfr]);
  await runFfmpeg([...VIDEO, ...ENC, ...LIMIT, silent]);
  await runFfmpeg([
    ...VIDEO,
    "-vf",
    "setpts=(N+floor(N/10))/FRAME_RATE/TB",
    "-fps_mode",
    "vfr",
    ...ENC,
    ...LIMIT,
    vfr,
  ]);
  return { dir, cfr, silent, vfr, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
