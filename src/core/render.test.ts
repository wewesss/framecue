import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./exec";
import { renderByRename, renderClip } from "./fixtures";
import { sha256File } from "./hash";
import { probeVideo } from "./probe";
import { attachAfter, createItem, readQueue, resolveWorkspace } from "./queue";
import {
  afterDirName,
  captureAfter,
  eventTargets,
  FrameOutOfRangeError,
  type Snapshot,
  StabilityTracker,
  watchVideo,
} from "./render";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(50);
}

let dir: string;

beforeAll(async () => {
  dir = join(tmpdir(), `framecue-render-${Math.random().toString(36).slice(2, 10)}`);
  await mkdir(dir, { recursive: true });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const snap = (size: number, mtimeMs: number): Snapshot => ({ size, mtimeMs });

describe("event filter", () => {
  test("only the watched file name matters", () => {
    expect(eventTargets("clip.mp4", "clip.mp4", false)).toBe(true);
    expect(eventTargets("other.mp4", "clip.mp4", false)).toBe(false);
    expect(eventTargets("clip.mp4.tmp", "clip.mp4", false)).toBe(false);
    expect(eventTargets("CLIP.MP4", "clip.mp4", true)).toBe(true);
    expect(eventTargets("CLIP.MP4", "clip.mp4", false)).toBe(false);
    expect(eventTargets(null, "clip.mp4", false)).toBe(true);
  });
});

describe("stability tracker", () => {
  test("a burst of events yields a single ready", () => {
    const tracker = new StabilityTracker(snap(10, 1), 1000);
    expect(tracker.sample(snap(10, 1), 0)).toBe("idle");
    tracker.touch();
    tracker.touch();
    const verdicts: string[] = [];
    const sizes = [100, 200, 300, 300, 300, 300, 300, 300];
    sizes.forEach((size, i) => {
      if (i === 1) tracker.touch();
      verdicts.push(tracker.sample(snap(size, 5), 250 * (i + 1)));
    });
    expect(verdicts.indexOf("ready")).toBe(6);
    tracker.commit();
    tracker.touch();
    expect(tracker.sample(snap(300, 5), 5000)).toBe("idle");
    expect(tracker.pending).toBe(false);
  });

  test("replace by rename: missing file then new file", () => {
    const tracker = new StabilityTracker(snap(10, 1), 1000);
    tracker.touch();
    expect(tracker.sample(null, 0)).toBe("wait");
    expect(tracker.sample(null, 250)).toBe("wait");
    expect(tracker.sample(snap(50, 9), 500)).toBe("wait");
    expect(tracker.sample(snap(50, 9), 1000)).toBe("wait");
    expect(tracker.sample(snap(50, 9), 1500)).toBe("ready");
    tracker.commit();
  });

  test("late events for the reported file are dropped", () => {
    const tracker = new StabilityTracker(snap(10, 1), 1000);
    tracker.touch();
    tracker.sample(snap(50, 9), 0);
    expect(tracker.sample(snap(50, 9), 1000)).toBe("ready");
    tracker.commit();
    tracker.touch();
    expect(tracker.sample(snap(50, 9), 1250)).toBe("idle");
  });

  test("an event that leaves the file as it was is ignored", () => {
    const tracker = new StabilityTracker(snap(10, 1), 1000);
    tracker.touch();
    expect(tracker.sample(snap(10, 1), 0)).toBe("idle");
  });

  test("a failed probe retries after another quiet period", () => {
    const tracker = new StabilityTracker(snap(10, 1), 1000);
    tracker.touch();
    tracker.sample(snap(50, 9), 0);
    expect(tracker.sample(snap(50, 9), 1000)).toBe("ready");
    tracker.retry(1000);
    expect(tracker.sample(snap(50, 9), 1250)).toBe("wait");
    expect(tracker.sample(snap(50, 9), 2000)).toBe("ready");
  });
});

describe("watchVideo", () => {
  test("exactly one trigger per render, by rename and in place", async () => {
    const clip = join(dir, "watched.mp4");
    await renderClip(clip);
    let count = 0;
    const close = watchVideo(
      clip,
      () => {
        count++;
      },
      { pollMs: 50, quietMs: 500 },
    );
    try {
      await writeFile(join(dir, "unrelated.txt"), "x");
      await sleep(900);
      expect(count).toBe(0);

      await renderByRename(clip, { box: [10, 20] });
      await waitFor(() => count >= 1, 8000);
      await sleep(1200);
      expect(count).toBe(1);

      await renderClip(clip, { box: [30, 40] });
      await waitFor(() => count >= 2, 8000);
      await sleep(1200);
      expect(count).toBe(2);
    } finally {
      close();
    }
    await renderByRename(clip, { box: [1, 2] });
    await sleep(1200);
    expect(count).toBe(2);
  }, 40_000);
});

describe("captureAfter", () => {
  let base: string;
  let changed: string;
  let short: string;

  beforeAll(async () => {
    base = join(dir, "base.mp4");
    changed = join(dir, "changed.mp4");
    short = join(dir, "short.mp4");
    await renderClip(base);
    await renderClip(changed, { box: [22, 30] });
    await renderClip(short, { seconds: 1 });
  });

  test("same frames, changed and unchanged pictures", async () => {
    const { root } = await resolveWorkspace(base, join(dir, "ws-after"));
    const info = await probeVideo(base);
    const sha = await sha256File(base);
    const frame = await createItem(root, {
      video: info,
      sha256: sha,
      kind: "frame",
      frameStart: 5,
      comment: "",
    });
    const range = await createItem(root, {
      video: info,
      sha256: sha,
      kind: "range",
      frameStart: 20,
      frameEnd: 30,
      comment: "",
    });
    const newSha = await sha256File(changed);
    const newInfo = await probeVideo(changed);

    const frameImages = await captureAfter(root, frame, changed, newSha, {
      frameCount: newInfo.frameCount,
    });
    expect(frameImages).toEqual([`frames/${frame.id}/${afterDirName(newSha)}/frame.png`]);
    expect(await md5(join(root, frameImages[0] as string))).toBe(
      await md5(join(root, frame.images[0] as string)),
    );

    const rangeImages = await captureAfter(root, range, changed, newSha);
    expect(rangeImages.map((p) => p.split("/").pop())).toEqual([
      "first.png",
      "middle.png",
      "last.png",
      "sheet.png",
    ]);
    const [bFirst, bMiddle, bLast] = range.images;
    const [aFirst, aMiddle, aLast] = rangeImages;
    expect(await md5(join(root, aFirst as string))).toBe(await md5(join(root, bFirst as string)));
    expect(await md5(join(root, aMiddle as string))).not.toBe(
      await md5(join(root, bMiddle as string)),
    );
    expect(await md5(join(root, aLast as string))).not.toBe(await md5(join(root, bLast as string)));
  }, 30_000);

  test("frames beyond a shorter render are skipped", async () => {
    const { root } = await resolveWorkspace(base, join(dir, "ws-short"));
    const info = await probeVideo(base);
    const sha = await sha256File(base);
    const late = await createItem(root, {
      video: info,
      sha256: sha,
      kind: "frame",
      frameStart: 40,
      comment: "",
    });
    const shortSha = await sha256File(short);
    const shortInfo = await probeVideo(short);
    await expect(
      captureAfter(root, late, short, shortSha, { frameCount: shortInfo.frameCount }),
    ).rejects.toBeInstanceOf(FrameOutOfRangeError);
    await expect(captureAfter(root, late, short, shortSha)).rejects.toBeInstanceOf(
      FrameOutOfRangeError,
    );
  }, 30_000);

  test("attachAfter replaces the previous after folder", async () => {
    const { root } = await resolveWorkspace(base, join(dir, "ws-replace"));
    const info = await probeVideo(base);
    const sha = await sha256File(base);
    const item = await createItem(root, {
      video: info,
      sha256: sha,
      kind: "frame",
      frameStart: 3,
      comment: "",
    });
    const first = await attachAfter(root, item.id, {
      videoPath: changed,
      sha256: "a".repeat(64),
      frameCount: 50,
    });
    expect(first.after?.images).toEqual([`frames/${item.id}/after-aaaaaaaa/frame.png`]);
    const second = await attachAfter(root, item.id, {
      videoPath: changed,
      sha256: "b".repeat(64),
      frameCount: 50,
    });
    expect(second.after?.sha256).toBe("b".repeat(64));
    expect(
      await Bun.file(join(root, "frames", item.id, "after-aaaaaaaa", "frame.png")).exists(),
    ).toBe(false);
    expect(
      await Bun.file(join(root, "frames", item.id, "after-bbbbbbbb", "frame.png")).exists(),
    ).toBe(true);
    const [stored] = await readQueue(root);
    expect(stored?.after?.sha256).toBe("b".repeat(64));
  }, 30_000);

  test("old JSONL lines without after still read", async () => {
    const root = join(dir, "ws-old");
    await mkdir(root, { recursive: true });
    const legacy = {
      id: "fc_old",
      video: { path: "x.mp4", sha256: "0".repeat(64) },
      fps: 25,
      kind: "frame",
      frameStart: 1,
      frameEnd: 1,
      timecode: "00:00:00:01",
      comment: "legacy",
      priority: 0,
      status: "fixed",
      images: ["frames/fc_old/frame.png"],
      agentNote: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeFile(join(root, "queue.jsonl"), `${JSON.stringify(legacy)}\n`);
    const [item] = await readQueue(root);
    expect(item?.comment).toBe("legacy");
    expect(item?.after ?? null).toBeNull();
  });
});
