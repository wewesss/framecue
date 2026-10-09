import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Fixtures, makeFixtures } from "./fixtures";
import { computePeaks, type PcmSpawn } from "./peaks";

let fx: Fixtures;
beforeAll(async () => {
  fx = await makeFixtures();
});
afterAll(async () => {
  await fx.cleanup();
});

describe("computePeaks", () => {
  test("length, bounds and sine level", async () => {
    const peaks = await computePeaks(fx.cfr);
    expect(peaks).not.toBeNull();
    const p = peaks as NonNullable<typeof peaks>;
    expect(p.rate).toBe(200);
    expect(Math.abs(p.length - 2 * 200)).toBeLessThanOrEqual(10);
    expect(p.data.length).toBe(p.length * 2);
    for (const v of p.data) {
      expect(v).toBeGreaterThanOrEqual(-127);
      expect(v).toBeLessThanOrEqual(127);
    }
    const mid = p.data.slice(100, 300);
    expect(Math.max(...mid)).toBeGreaterThan(14);
    expect(Math.max(...mid)).toBeLessThan(18);
    expect(Math.min(...mid)).toBeLessThan(-14);
    expect(Math.min(...mid)).toBeGreaterThan(-18);
  });

  test("no audio returns null", async () => {
    expect(await computePeaks(fx.silent)).toBeNull();
  });

  test("cache file is written then reused without spawning ffmpeg", async () => {
    const workspace = join(fx.dir, "ws-peaks");
    let spawned = 0;
    const counting: PcmSpawn = (cmd) => {
      spawned++;
      const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
      return {
        stdout: proc.stdout as ReadableStream<Uint8Array>,
        stderr: new Response(proc.stderr as ReadableStream).text(),
        exited: proc.exited,
      };
    };
    const sha256 = "a".repeat(64);
    const first = await computePeaks(fx.cfr, { workspace, sha256, spawn: counting });
    expect(spawned).toBe(1);
    expect(existsSync(join(workspace, "cache", `peaks-${sha256}-200.bin`))).toBe(true);
    const second = await computePeaks(fx.cfr, { workspace, sha256, spawn: counting });
    expect(spawned).toBe(1);
    expect(second?.data).toEqual(first?.data as Int8Array);
    expect(second?.length).toBe(first?.length as number);
  });
});
