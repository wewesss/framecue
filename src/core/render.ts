import { statSync, watch } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { captureItemImages } from "./frames";
import { probeVideo } from "./probe";
import type { Item } from "./types";

export const POLL_MS = 250;
export const QUIET_MS = 1000;
const MISSING_GIVE_UP_MS = 30_000;

export interface RenderSource {
  onRender(cb: () => void): () => void;
  close(): void;
}

export interface Snapshot {
  size: number;
  mtimeMs: number;
}

export type Verdict = "idle" | "wait" | "ready";

export function sameSnapshot(a: Snapshot | null, b: Snapshot | null): boolean {
  return a !== null && b !== null && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

export function eventTargets(
  filename: string | null | undefined,
  target: string,
  caseInsensitive = process.platform === "win32",
): boolean {
  if (filename === null || filename === undefined || filename === "") return true;
  const name = basename(filename);
  return caseInsensitive ? name.toLowerCase() === target.toLowerCase() : name === target;
}

export class StabilityTracker {
  pending = false;
  private last: Snapshot | null = null;
  private unchangedSince: number | null = null;
  private missingSince: number | null = null;
  private reported: Snapshot | null;

  constructor(
    initial: Snapshot | null,
    private readonly quietMs = QUIET_MS,
  ) {
    this.reported = initial;
  }

  touch(): void {
    this.pending = true;
  }

  sample(snapshot: Snapshot | null, now: number): Verdict {
    if (!this.pending) return "idle";
    if (snapshot === null) {
      this.last = null;
      this.unchangedSince = null;
      this.missingSince ??= now;
      if (now - this.missingSince >= MISSING_GIVE_UP_MS) this.reset();
      return this.pending ? "wait" : "idle";
    }
    this.missingSince = null;
    if (!sameSnapshot(this.last, snapshot)) {
      this.last = snapshot;
      this.unchangedSince = now;
      if (sameSnapshot(this.reported, snapshot)) {
        this.reset();
        return "idle";
      }
      return "wait";
    }
    if (this.unchangedSince !== null && now - this.unchangedSince >= this.quietMs) return "ready";
    return "wait";
  }

  retry(now: number): void {
    this.unchangedSince = now;
  }

  commit(): void {
    this.reported = this.last;
    this.reset();
  }

  private reset(): void {
    this.pending = false;
    this.last = null;
    this.unchangedSince = null;
    this.missingSince = null;
  }
}

async function snapshotOf(path: string): Promise<Snapshot | null> {
  try {
    const s = await stat(path);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

async function readable(path: string): Promise<boolean> {
  try {
    const handle = await open(path, "r");
    await handle.close();
    await probeVideo(path);
    return true;
  } catch {
    return false;
  }
}

export interface WatchOptions {
  pollMs?: number;
  quietMs?: number;
}

export function createFsRenderSource(path: string, options: WatchOptions = {}): RenderSource {
  const pollMs = options.pollMs ?? POLL_MS;
  const target = basename(path);
  const listeners = new Set<() => void>();
  let initial: Snapshot | null = null;
  try {
    const s = statSync(path);
    initial = { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    initial = null;
  }
  const tracker = new StabilityTracker(initial, options.quietMs);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let closed = false;

  const schedule = () => {
    if (closed || timer !== null || running) return;
    timer = setTimeout(() => {
      timer = null;
      void tick();
    }, pollMs);
  };

  const tick = async () => {
    running = true;
    try {
      const snapshot = await snapshotOf(path);
      if (closed) return;
      if (tracker.sample(snapshot, Date.now()) === "ready") {
        const ok = await readable(path);
        if (closed) return;
        if (ok && sameSnapshot(snapshot, await snapshotOf(path))) {
          tracker.commit();
          for (const cb of [...listeners]) cb();
        } else {
          tracker.retry(Date.now());
        }
      }
    } finally {
      running = false;
      if (tracker.pending) schedule();
    }
  };

  let watcher: ReturnType<typeof watch> | null = null;
  try {
    watcher = watch(dirname(path), { persistent: true }, (_event, filename) => {
      if (closed || !eventTargets(filename, target)) return;
      tracker.touch();
      schedule();
    });
    watcher.on("error", () => undefined);
  } catch {
    watcher = null;
  }

  return {
    onRender(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    close() {
      closed = true;
      listeners.clear();
      if (timer !== null) clearTimeout(timer);
      timer = null;
      watcher?.close();
      watcher = null;
    },
  };
}

export function watchVideo(
  path: string,
  onStable: () => void,
  options: WatchOptions = {},
): () => void {
  const source = createFsRenderSource(path, options);
  source.onRender(onStable);
  return () => source.close();
}

export class FrameOutOfRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameOutOfRangeError";
  }
}

export function afterDirName(sha256: string): string {
  return `after-${sha256.slice(0, 8)}`;
}

export async function captureAfter(
  root: string,
  item: Pick<Item, "id" | "kind" | "frameStart" | "frameEnd">,
  videoPath: string,
  sha256: string,
  opts: { frameCount?: number } = {},
): Promise<string[]> {
  if (opts.frameCount !== undefined && item.frameEnd > opts.frameCount - 1) {
    throw new FrameOutOfRangeError(
      `Frame ${item.frameEnd} is beyond the new render (${opts.frameCount} frames)`,
    );
  }
  const dirName = afterDirName(sha256);
  let names: string[];
  try {
    names = await captureItemImages(videoPath, item, join(root, "frames", item.id, dirName));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Expected ")) throw new FrameOutOfRangeError(message);
    throw error;
  }
  return names.map((name) => `frames/${item.id}/${dirName}/${name}`);
}
