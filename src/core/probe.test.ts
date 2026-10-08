import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Fixtures, makeFixtures } from "./fixtures";
import { sha256File } from "./hash";
import { probeVideo } from "./probe";

let fx: Fixtures;
beforeAll(async () => {
  fx = await makeFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("probeVideo", () => {
  test("CFR clip", async () => {
    const info = await probeVideo(fx.cfr);
    expect(info.fps).toBe(25);
    expect(info.frameCount).toBe(50);
    expect(info.width).toBe(160);
    expect(info.height).toBe(90);
    expect(info.codec).toBe("h264");
    expect(info.vfr).toBe(false);
  });

  test("VFR clip is flagged", async () => {
    const info = await probeVideo(fx.vfr);
    expect(info.vfr).toBe(true);
  });

  test("missing file throws", async () => {
    await expect(probeVideo(`${fx.dir}/nope.mp4`)).rejects.toThrow();
  });

  test("sha256File is stable hex", async () => {
    const a = await sha256File(fx.cfr);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256File(fx.cfr)).toBe(a);
  });
});
