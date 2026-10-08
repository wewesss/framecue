import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./exec";
import { type Fixtures, makeFixtures } from "./fixtures";
import { captureItemImages, extractContactSheet, extractFrames } from "./frames";

let fx: Fixtures;
let refDir: string;

async function md5(png: string): Promise<string> {
  const res = await run([
    "ffmpeg",
    "-v",
    "error",
    "-i",
    png,
    "-pix_fmt",
    "rgb24",
    "-f",
    "md5",
    "-",
  ]);
  expect(res.exitCode).toBe(0);
  return res.stdout.trim();
}

async function pngWidth(png: string): Promise<number> {
  const res = await run([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    png,
  ]);
  return Number.parseInt(res.stdout.split(",")[0] ?? "", 10);
}

const ref = (n: number) => join(refDir, `ref_${String(n + 1).padStart(4, "0")}.png`);

beforeAll(async () => {
  fx = await makeFixtures();
  refDir = join(fx.dir, "ref");
  await mkdir(refDir);
  const res = await run([
    "ffmpeg",
    "-v",
    "error",
    "-i",
    fx.cfr,
    "-fps_mode",
    "passthrough",
    join(refDir, "ref_%04d.png"),
  ]);
  expect(res.exitCode).toBe(0);
});
afterAll(async () => {
  await fx.cleanup();
});

describe("frames", () => {
  test("extracted frame N equals decoded frame N", async () => {
    const out = join(fx.dir, "out");
    const paths = await extractFrames(fx.cfr, [49, 0, 17, 17], out);
    expect(paths.length).toBe(3);
    for (const n of [0, 17, 49]) {
      expect(await md5(join(out, `f${n}.png`))).toBe(await md5(ref(n)));
    }
    expect(await md5(join(out, "f0.png"))).not.toBe(await md5(join(out, "f17.png")));
  });

  test("custom names", async () => {
    const out = join(fx.dir, "named");
    const paths = await extractFrames(fx.cfr, [5, 2], out, { names: ["a.png", "b.png"] });
    expect(paths.map((p) => p.split(/[\\/]/).pop()).sort()).toEqual(["a.png", "b.png"]);
    expect(await md5(join(out, "a.png"))).toBe(await md5(ref(5)));
    expect(await md5(join(out, "b.png"))).toBe(await md5(ref(2)));
  });

  test("frame beyond end throws", async () => {
    await expect(extractFrames(fx.cfr, [500], join(fx.dir, "bad"))).rejects.toThrow();
  });

  test("contact sheet dimensions", async () => {
    const sheet = join(fx.dir, "sheet.png");
    await extractContactSheet(fx.cfr, 0, 49, sheet, { cols: 4, rows: 4, thumbWidth: 80 });
    expect(await pngWidth(sheet)).toBe(320);
  });

  test("captureItemImages", async () => {
    const single = await captureItemImages(
      fx.cfr,
      { kind: "frame", frameStart: 3, frameEnd: 3 },
      join(fx.dir, "i1"),
    );
    expect(single).toEqual(["frame.png"]);
    const range = await captureItemImages(
      fx.cfr,
      { kind: "range", frameStart: 10, frameEnd: 40 },
      join(fx.dir, "i2"),
    );
    expect(range).toEqual(["first.png", "middle.png", "last.png", "sheet.png"]);
    expect(await md5(join(fx.dir, "i2", "middle.png"))).toBe(await md5(ref(25)));
  });
});
