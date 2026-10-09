import { link, mkdir, open, readFile, rename, stat, unlink, utimes } from "node:fs/promises";
import { join } from "node:path";

export const LOCK_FILE = "queue.lock";

export interface LockOptions {
  timeoutMs?: number;
  staleMs?: number;
  retryMs?: number;
  heartbeatMs?: number;
}

const DEFAULTS = { timeoutMs: 5000, staleMs: 10_000, retryMs: 15, heartbeatMs: 2000 };

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function isStale(file: string, staleMs: number): Promise<boolean> {
  let raw: string;
  let mtimeMs: number;
  try {
    raw = await readFile(file, "utf8");
    mtimeMs = (await stat(file)).mtimeMs;
  } catch {
    return false;
  }
  if (Date.now() - mtimeMs > staleMs) return true;
  const pid = Number.parseInt(raw.split(/\s+/)[0] ?? "", 10);
  return Number.isInteger(pid) && !pidAlive(pid);
}

export async function withFileLock<T>(
  root: string,
  fn: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const { timeoutMs, staleMs, retryMs, heartbeatMs } = { ...DEFAULTS, ...options };
  await mkdir(root, { recursive: true });
  const file = join(root, LOCK_FILE);
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  for (;;) {
    try {
      const handle = await open(file, "wx");
      try {
        await handle.writeFile(`${process.pid} ${Date.now()}\n`);
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM" && code !== "EBUSY") throw error;
      if (code === "EEXIST" && (await isStale(file, staleMs))) {
        await takeOver(file, staleMs);
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for the queue lock (${file})`);
      }
      attempt++;
      await sleep(Math.min(retryMs * 2 ** Math.min(attempt, 4), 250) * (0.5 + Math.random()));
    }
  }
  const beat = setInterval(() => {
    const now = new Date();
    utimes(file, now, now).catch(() => undefined);
  }, heartbeatMs);
  beat.unref?.();
  try {
    return await fn();
  } finally {
    clearInterval(beat);
    await unlink(file).catch(() => undefined);
  }
}

async function takeOver(file: string, staleMs: number): Promise<void> {
  const claimed = `${file}.stale-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await rename(file, claimed);
  } catch {
    return;
  }
  if (await isStale(claimed, staleMs)) {
    await unlink(claimed).catch(() => undefined);
    return;
  }
  await link(claimed, file).catch(() => undefined);
  await unlink(claimed).catch(() => undefined);
}
