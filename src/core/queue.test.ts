import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Fixtures, makeFixtures } from "./fixtures";
import { sha256File } from "./hash";
import { probeVideo } from "./probe";
import {
  canTransition,
  createItem,
  deleteItem,
  newId,
  readQueue,
  reorder,
  resolveWorkspace,
  updateItem,
  writeQueue,
} from "./queue";
import type { VideoInfo } from "./types";

let fx: Fixtures;
let info: VideoInfo;
let sha: string;

beforeAll(async () => {
  fx = await makeFixtures();
  info = await probeVideo(fx.cfr);
  sha = await sha256File(fx.cfr);
});
afterAll(async () => {
  await fx.cleanup();
});

describe("queue", () => {
  test("workspace, create, read, reorder, delete", async () => {
    const { root } = await resolveWorkspace(fx.cfr, join(fx.dir, "ws1"));
    expect(existsSync(join(root, "frames"))).toBe(true);
    expect(await readQueue(root)).toEqual([]);

    const a = await createItem(root, {
      video: info,
      kind: "frame",
      frameStart: 7,
      comment: "a",
      sha256: sha,
    });
    const b = await createItem(root, {
      video: info,
      kind: "range",
      frameStart: 5,
      frameEnd: 30,
      comment: "b",
      sha256: sha,
    });
    expect(a.status).toBe("todo");
    expect(a.frameEnd).toBe(7);
    expect(a.timecode).toBe("00:00:00:07");
    expect(a.images).toEqual([`frames/${a.id}/frame.png`]);
    expect(b.priority).toBe(1);
    expect(b.images.length).toBe(4);
    expect(existsSync(join(root, b.images[3] as string))).toBe(true);

    const read = await readQueue(root);
    expect(read.map((i) => i.id)).toEqual([a.id, b.id]);

    await reorder(root, [b.id, a.id]);
    const re = await readQueue(root);
    expect(re.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(re.map((i) => i.priority)).toEqual([0, 1]);

    await deleteItem(root, b.id);
    expect(existsSync(join(root, "frames", b.id))).toBe(false);
    expect((await readQueue(root)).length).toBe(1);
    expect((await readdir(root)).some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  test("region item and validation", async () => {
    const { root } = await resolveWorkspace(fx.cfr, join(fx.dir, "ws2"));
    const base = { video: info, comment: "x", sha256: sha };
    const ok = await createItem(root, {
      ...base,
      kind: "region",
      frameStart: 1,
      region: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    });
    expect(ok.region).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    await expect(createItem(root, { ...base, kind: "region", frameStart: 1 })).rejects.toThrow();
    await expect(
      createItem(root, {
        ...base,
        kind: "region",
        frameStart: 1,
        region: { x: 2, y: 0, w: 1, h: 1 },
      }),
    ).rejects.toThrow();
    await expect(createItem(root, { ...base, kind: "frame", frameStart: 50 })).rejects.toThrow();
    await expect(createItem(root, { ...base, kind: "frame", frameStart: -1 })).rejects.toThrow();
    await expect(
      createItem(root, { ...base, kind: "range", frameStart: 9, frameEnd: 3 }),
    ).rejects.toThrow();
    expect((await readQueue(root)).length).toBe(1);
  });

  test("status transitions", async () => {
    const { root } = await resolveWorkspace(fx.cfr, join(fx.dir, "ws3"));
    const it = await createItem(root, {
      video: info,
      kind: "frame",
      frameStart: 2,
      comment: "c",
      sha256: sha,
    });
    const agent = { actor: "agent" } as const;
    await expect(updateItem(root, it.id, { status: "verified" }, agent)).rejects.toThrow(
      "Invalid status transition",
    );
    await expect(updateItem(root, it.id, { status: "reopened" }, agent)).rejects.toThrow();
    await expect(updateItem(root, it.id, { status: "todo" }, agent)).rejects.toThrow();
    const fixed = await updateItem(root, it.id, { status: "fixed", agentNote: "done" }, agent);
    expect(fixed.agentNote).toBe("done");
    await expect(updateItem(root, it.id, { status: "fixed" }, agent)).rejects.toThrow();
    await expect(updateItem(root, it.id, { status: "verified" }, agent)).rejects.toThrow();
    expect((await updateItem(root, it.id, { status: "reopened" })).status).toBe("reopened");
    expect((await updateItem(root, it.id, { status: "fixed" }, agent)).status).toBe("fixed");
    expect((await updateItem(root, it.id, { status: "verified", comment: "ok" })).status).toBe(
      "verified",
    );
    await expect(updateItem(root, it.id, { status: "fixed" }, agent)).rejects.toThrow();
    expect((await updateItem(root, it.id, { status: "todo" })).status).toBe("todo");
    expect((await updateItem(root, it.id, { status: "verified" })).status).toBe("verified");
    await expect(updateItem(root, "nope", { comment: "x" })).rejects.toThrow();

    expect(canTransition("todo", "fixed")).toBe(true);
    expect(canTransition("todo", "verified")).toBe(false);
    expect(canTransition("verified", "reopened")).toBe(true);
    expect(canTransition("reopened", "verified")).toBe(false);
  });

  test("bad JSON reports the line number", async () => {
    const { root } = await resolveWorkspace(fx.cfr, join(fx.dir, "ws4"));
    await writeFile(join(root, "queue.jsonl"), '{"priority":0}\n\n{oops\n');
    await expect(readQueue(root)).rejects.toThrow(/line 3/);
  });

  test("concurrent creates are serialised", async () => {
    const { root } = await resolveWorkspace(fx.cfr, join(fx.dir, "ws5"));
    const base = { video: info, kind: "frame" as const, comment: "p", sha256: sha };
    const made = await Promise.all([
      createItem(root, { ...base, frameStart: 1 }),
      createItem(root, { ...base, frameStart: 2 }),
      createItem(root, { ...base, frameStart: 3 }),
    ]);
    const items = await readQueue(root);
    expect(items.length).toBe(3);
    expect(new Set(items.map((i) => i.priority)).size).toBe(3);
    expect(new Set(made.map((m) => m.id)).size).toBe(3);
  });

  test("newId format and atomic write", async () => {
    expect(newId()).toMatch(/^fc_[0-9a-z]+$/);
    const { root } = await resolveWorkspace(fx.cfr, join(fx.dir, "ws6"));
    await writeQueue(root, []);
    expect((await readdir(root)).includes("queue.jsonl.tmp")).toBe(false);
  });
});
