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
    expect(info.audio).toEqual({
      codec: "aac",
      sampleRate: 48000,
      channels: 1,
      channelLayout: "mono",
    });
  });

  test("clip without audio has audio null", async () => {
    expect((await probeVideo(fx.silent)).audio).toBeNull();
  });

  test("VFR clip is flagged", async () => {
    const info = await probeVideo(fx.vfr);
    expect(info.vfr).toBe(true);
  });

  test("long CFR clip with B-frames and audio is not flagged VFR", async () => {
    const path = `${fx.dir}/long-bframes.mp4`;
    const ff = Bun.spawn(
      [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=160x90:rate=25",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:sample_rate=48000",
        "-t",
        "20",
        "-c:v",
        "libx264",
        "-bf",
        "3",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        path,
      ],
      { stderr: "pipe" },
    );
    expect(await ff.exited).toBe(0);
    const info = await probeVideo(path);
    expect(info.frameCount).toBe(500);
    expect(info.vfr).toBe(false);
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
