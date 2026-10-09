import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { captureItemImages } from "./frames";
import { withFileLock } from "./lock";
import { afterDirName, captureAfter } from "./render";
import { frameToTimecode } from "./timecode";
import type { Item, ItemKind, ItemStatus, Region, VideoInfo } from "./types";

const QUEUE_FILE = "queue.jsonl";

const TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  todo: ["fixed"],
  fixed: ["verified", "reopened"],
  reopened: ["fixed"],
  verified: ["reopened"],
};

export type Actor = "user" | "agent";

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

const locks = new Map<string, Promise<unknown>>();

const writeListeners = new Set<(root: string, hash: string) => void>();

export function onQueueWritten(listener: (root: string, hash: string) => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

export function hashText(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);

async function retryTransient<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 8 || !code || !TRANSIENT.has(code)) throw error;
      await new Promise((done) => setTimeout(done, 10 * (attempt + 1)));
    }
  }
}

function withLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(root);
  const prev = locks.get(key) ?? Promise.resolve();
  const guarded = () => withFileLock(root, fn);
  const next = prev.then(guarded, guarded);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

export async function resolveWorkspace(videoPath: string, dir?: string): Promise<{ root: string }> {
  const root = resolve(dir ?? join(dirname(resolve(videoPath)), ".framecue"));
  await mkdir(join(root, "frames"), { recursive: true });
  return { root };
}

export async function readQueue(root: string): Promise<Item[]> {
  let text: string;
  try {
    text = await retryTransient(() => readFile(join(root, QUEUE_FILE), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const items: Item[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const item = JSON.parse(line) as Item;
      item.after ??= null;
      items.push(item);
    } catch (error) {
      throw new Error(`Invalid JSON in ${QUEUE_FILE} at line ${i + 1}: ${String(error)}`);
    }
  });
  return items.sort((a, b) => a.priority - b.priority);
}

export async function writeQueue(root: string, items: Item[]): Promise<void> {
  const file = join(root, QUEUE_FILE);
  const tmp = `${file}.tmp`;
  await mkdir(root, { recursive: true });
  const text = items.map((it) => `${JSON.stringify(it)}\n`).join("");
  await writeFile(tmp, text);
  await retryTransient(() => rename(tmp, file));
  const hash = hashText(text);
  for (const listener of [...writeListeners]) listener(resolve(root), hash);
}

export function newId(): string {
  let rand = "";
  for (let i = 0; i < 4; i++) rand += Math.floor(Math.random() * 36).toString(36);
  return `fc_${Date.now().toString(36)}${rand}`;
}

function validateRegion(region: Region): void {
  for (const key of ["x", "y", "w", "h"] as const) {
    const v = region[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`Region ${key} must be a number between 0 and 1`);
    }
  }
}

export interface CreateItemInput {
  video: VideoInfo;
  kind: ItemKind;
  frameStart: number;
  frameEnd?: number;
  region?: Region | null;
  comment: string;
  sha256: string;
}

export function createItem(root: string, input: CreateItemInput): Promise<Item> {
  return withLock(root, async () => {
    const { video, kind } = input;
    const frameStart = input.frameStart;
    const frameEnd = input.frameEnd ?? frameStart;
    if (!Number.isInteger(frameStart) || !Number.isInteger(frameEnd)) {
      throw new Error("Frames must be integers");
    }
    if (frameStart < 0 || frameEnd > video.frameCount - 1) {
      throw new Error(`Frames must be within [0, ${video.frameCount - 1}]`);
    }
    if (frameStart > frameEnd) throw new Error("frameStart must be <= frameEnd");
    if (kind === "region" && !input.region) throw new Error("A region item requires a region");
    if (input.region) validateRegion(input.region);

    const items = await readQueue(root);
    const id = newId();
    const itemDir = join(root, "frames", id);
    const images = await captureItemImages(video.path, { kind, frameStart, frameEnd }, itemDir);
    const now = new Date().toISOString();
    const item: Item = {
      id,
      video: { path: video.path, sha256: input.sha256 },
      fps: video.fps,
      kind,
      frameStart,
      frameEnd,
      timecode: frameToTimecode(frameStart, video.fps),
      region: input.region ?? null,
      comment: input.comment,
      priority: items.reduce((m, it) => Math.max(m, it.priority), -1) + 1,
      status: "todo",
      images: images.map((name) => `frames/${id}/${name}`),
      after: null,
      agentNote: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeQueue(root, [...items, item]);
    return item;
  });
}

export interface ItemPatch {
  comment?: string;
  priority?: number;
  status?: ItemStatus;
  agentNote?: string | null;
  region?: Region | null;
}

export function updateItem(
  root: string,
  id: string,
  patch: ItemPatch,
  { actor }: { actor: Actor } = { actor: "user" },
): Promise<Item> {
  return withLock(root, async () => {
    const items = await readQueue(root);
    const item = items.find((it) => it.id === id);
    if (!item) throw new Error(`Item not found: ${id}`);
    if (
      actor === "agent" &&
      patch.status !== undefined &&
      !(patch.status === "fixed" && (item.status === "todo" || item.status === "reopened"))
    ) {
      throw new Error(`Invalid status transition: ${item.status} -> ${patch.status}`);
    }
    if (patch.region) validateRegion(patch.region);
    if (patch.comment !== undefined) item.comment = patch.comment;
    if (patch.priority !== undefined) item.priority = patch.priority;
    if (patch.status !== undefined) item.status = patch.status;
    if (patch.agentNote !== undefined) item.agentNote = patch.agentNote;
    if (patch.region !== undefined) item.region = patch.region;
    item.updatedAt = new Date().toISOString();
    await writeQueue(root, items);
    return item;
  });
}

export function deleteItem(root: string, id: string): Promise<void> {
  return withLock(root, async () => {
    const items = await readQueue(root);
    if (!items.some((it) => it.id === id)) throw new Error(`Item not found: ${id}`);
    await writeQueue(
      root,
      items.filter((it) => it.id !== id),
    );
    await rm(join(root, "frames", id), { recursive: true, force: true });
  });
}

export function reorder(root: string, ids: string[]): Promise<Item[]> {
  return withLock(root, async () => {
    const items = await readQueue(root);
    const byId = new Map(items.map((it) => [it.id, it]));
    for (const id of ids) {
      if (!byId.has(id)) throw new Error(`Item not found: ${id}`);
    }
    const rest = items.filter((it) => !ids.includes(it.id));
    const ordered = [...ids.map((id) => byId.get(id) as Item), ...rest];
    const now = new Date().toISOString();
    ordered.forEach((it, i) => {
      if (it.priority !== i) {
        it.priority = i;
        it.updatedAt = now;
      }
    });
    await writeQueue(root, ordered);
    return ordered;
  });
}

export function attachAfter(
  root: string,
  id: string,
  render: { videoPath: string; sha256: string; frameCount: number },
): Promise<Item> {
  return withLock(root, async () => {
    const items = await readQueue(root);
    const item = items.find((it) => it.id === id);
    if (!item) throw new Error(`Item not found: ${id}`);
    const images = await captureAfter(root, item, render.videoPath, render.sha256, {
      frameCount: render.frameCount,
    });
    const keep = afterDirName(render.sha256);
    const itemDir = join(root, "frames", id);
    for (const entry of await readdir(itemDir)) {
      if (entry.startsWith("after-") && entry !== keep) {
        await rm(join(itemDir, entry), { recursive: true, force: true });
      }
    }
    const now = new Date().toISOString();
    item.after = { sha256: render.sha256, capturedAt: now, images };
    item.updatedAt = now;
    await writeQueue(root, items);
    return item;
  });
}

export function clearAfter(root: string, id: string): Promise<Item> {
  return withLock(root, async () => {
    const items = await readQueue(root);
    const item = items.find((it) => it.id === id);
    if (!item) throw new Error(`Item not found: ${id}`);
    const itemDir = join(root, "frames", id);
    let entries: string[] = [];
    try {
      entries = await readdir(itemDir);
    } catch {}
    for (const entry of entries) {
      if (entry.startsWith("after-"))
        await rm(join(itemDir, entry), { recursive: true, force: true });
    }
    if (item.after != null) {
      item.after = null;
      item.updatedAt = new Date().toISOString();
      await writeQueue(root, items);
    }
    return item;
  });
}
