import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCK_FILE, withFileLock } from "./lock";
import { readQueue, writeQueue } from "./queue";
import type { Item } from "./types";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "framecue-lock-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakeItem(id: string, priority: number, comment: string): Item {
  return {
    id,
    video: { path: "v.mp4", sha256: "x" },
    fps: 25,
    kind: "frame",
    frameStart: 0,
    frameEnd: 0,
    timecode: "00:00:00:00",
    region: null,
    comment,
    priority,
    status: "todo",
    images: [],
    after: null,
    agentNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("inter-process queue lock", () => {
  test("3 processes x 20 concurrent writes lose no update", async () => {
    const root = join(dir, "multi");
    await mkdir(root, { recursive: true });
    const tags = ["a", "b", "c"];
    const per = 20;
    const items: Item[] = [];
    for (const tag of tags) {
      for (let i = 0; i < per; i++) items.push(fakeItem(`${tag}${i}`, items.length, `todo-${tag}`));
    }
    await writeQueue(root, items);

    const worker = join(import.meta.dir, "lock.worker.ts");
    const procs = tags.map((tag) =>
      Bun.spawn([process.execPath, worker, root, tag, String(per)], {
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
    const codes = await Promise.all(procs.map((p) => p.exited));
    expect(codes).toEqual([0, 0, 0]);

    const text = await readFile(join(root, "queue.jsonl"), "utf8");
    const lines = text.split("\n").filter((l) => l !== "");
    expect(lines.length).toBe(tags.length * per);
    for (const line of lines) JSON.parse(line);
    const after = await readQueue(root);
    for (const tag of tags) {
      const done = after.filter((it) => it.comment.startsWith(`done-${tag}-`));
      expect(done.length).toBe(per);
    }
    expect(after.some((it) => it.comment.startsWith("todo-"))).toBe(false);
    expect(await Bun.file(join(root, LOCK_FILE)).exists()).toBe(false);
  }, 60_000);

  test("a lock of a dead process is taken over", async () => {
    const root = join(dir, "dead");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, LOCK_FILE), `99999999 ${Date.now()}\n`);
    const started = Date.now();
    const value = await withFileLock(root, async () => "ok", { timeoutMs: 2000 });
    expect(value).toBe("ok");
    expect(Date.now() - started).toBeLessThan(1500);
    expect(await Bun.file(join(root, LOCK_FILE)).exists()).toBe(false);
  });

  test("an old lock is taken over even if its pid looks alive", async () => {
    const root = join(dir, "old");
    await mkdir(root, { recursive: true });
    const file = join(root, LOCK_FILE);
    await writeFile(file, `${process.pid} ${Date.now() - 60_000}\n`);
    const past = new Date(Date.now() - 60_000);
    await utimes(file, past, past);
    expect(await withFileLock(root, async () => "ok", { timeoutMs: 2000 })).toBe("ok");
  });

  test("a fresh lock held by a live process times out", async () => {
    const root = join(dir, "busy");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, LOCK_FILE), `${process.pid} ${Date.now()}\n`);
    await expect(withFileLock(root, async () => "no", { timeoutMs: 250 })).rejects.toThrow(
      "Timed out",
    );
    expect(await Bun.file(join(root, LOCK_FILE)).exists()).toBe(true);
  });

  test("the lock is released when the work throws", async () => {
    const root = join(dir, "throws");
    await mkdir(root, { recursive: true });
    await expect(
      withFileLock(root, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await Bun.file(join(root, LOCK_FILE)).exists()).toBe(false);
  });
});
