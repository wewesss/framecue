import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runFfmpeg } from "./exec";
import type { ItemKind } from "./types";

function selectExpr(frames: number[]): string {
  return frames.map((f) => `eq(n\\,${f})`).join("+");
}

export async function extractFrames(
  videoPath: string,
  frames: number[],
  outDir: string,
  opts: { names?: string[] } = {},
): Promise<string[]> {
  const requested = opts.names;
  if (requested && requested.length !== frames.length) {
    throw new Error("names must have the same length as frames");
  }
  if (frames.some((f) => !Number.isInteger(f) || f < 0)) {
    throw new Error("frames must be non-negative integers");
  }
  const nameByFrame = new Map<number, string>();
  frames.forEach((f, i) => {
    nameByFrame.set(f, requested?.[i] ?? `f${f}.png`);
  });
  const sorted = [...nameByFrame.keys()].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  await mkdir(outDir, { recursive: true });
  await runFfmpeg([
    "-i",
    videoPath,
    "-vf",
    `select=${selectExpr(sorted)}`,
    "-fps_mode",
    "passthrough",
    "-frames:v",
    String(sorted.length),
    join(outDir, "tmp_%05d.png"),
  ]);

  const produced = (await readdir(outDir)).filter((f) => /^tmp_\d+\.png$/.test(f)).sort();
  if (produced.length !== sorted.length) {
    for (const f of produced) await rm(join(outDir, f), { force: true });
    throw new Error(
      `Expected ${sorted.length} frames, ffmpeg produced ${produced.length} (frame beyond end of video?)`,
    );
  }
  const out: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const target = join(outDir, nameByFrame.get(sorted[i] as number) as string);
    await rm(target, { force: true });
    await rename(join(outDir, produced[i] as string), target);
    out.push(target);
  }
  return out;
}

export async function extractContactSheet(
  videoPath: string,
  frameStart: number,
  frameEnd: number,
  outPath: string,
  opts: { cols?: number; rows?: number; thumbWidth?: number } = {},
): Promise<string> {
  const cols = opts.cols ?? 4;
  const rows = opts.rows ?? 4;
  const thumbWidth = opts.thumbWidth ?? 320;
  const total = cols * rows;
  const span = frameEnd - frameStart;
  const picked = new Set<number>();
  if (span + 1 <= total) {
    for (let f = frameStart; f <= frameEnd; f++) picked.add(f);
  } else {
    for (let i = 0; i < total; i++) picked.add(frameStart + Math.round((span * i) / (total - 1)));
  }
  const sorted = [...picked].sort((a, b) => a - b);
  await mkdir(dirname(outPath), { recursive: true });
  await runFfmpeg([
    "-i",
    videoPath,
    "-vf",
    `select=${selectExpr(sorted)},scale=${thumbWidth}:-2,tile=${cols}x${rows}`,
    "-fps_mode",
    "passthrough",
    "-frames:v",
    "1",
    outPath,
  ]);
  return outPath;
}

export async function captureItemImages(
  videoPath: string,
  item: { kind: ItemKind; frameStart: number; frameEnd: number },
  itemDir: string,
): Promise<string[]> {
  await mkdir(itemDir, { recursive: true });
  if (item.frameStart === item.frameEnd) {
    await extractFrames(videoPath, [item.frameStart], itemDir, { names: ["frame.png"] });
    return ["frame.png"];
  }
  const middle = Math.floor((item.frameStart + item.frameEnd) / 2);
  const wanted = [
    ["first.png", item.frameStart],
    ["middle.png", middle],
    ["last.png", item.frameEnd],
  ] as const;
  const unique = [...new Set(wanted.map(([, f]) => f))];
  const paths = await extractFrames(videoPath, unique, itemDir);
  const byFrame = new Map(unique.map((f, i) => [f, paths[i] as string]));
  for (const [name, f] of wanted) {
    await copyFile(byFrame.get(f) as string, join(itemDir, name));
  }
  for (const p of paths) await rm(p, { force: true });
  await extractContactSheet(videoPath, item.frameStart, item.frameEnd, join(itemDir, "sheet.png"));
  return ["first.png", "middle.png", "last.png", "sheet.png"];
}
