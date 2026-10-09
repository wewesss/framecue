import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const WORKSPACE_NAME = ".framecue";
const QUEUE_FILE = "queue.jsonl";

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isWorkspace(dir: string): boolean {
  return basename(dir) === WORKSPACE_NAME || existsSync(join(dir, QUEUE_FILE));
}

export function findWorkspaceUpward(from: string): string | null {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, WORKSPACE_NAME);
    if (isDir(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface WorkspaceTarget {
  path?: string;
  dir?: string;
  cwd: string;
}

export function resolveMcpWorkspace({ path, dir, cwd }: WorkspaceTarget): string {
  if (dir) {
    const root = resolve(cwd, dir);
    if (!isDir(root)) throw new Error(`Workspace folder not found: ${root}`);
    return root;
  }
  if (!path) {
    const found = findWorkspaceUpward(cwd);
    if (!found) {
      throw new Error(
        `No ${WORKSPACE_NAME} folder found from ${cwd} upward. Pass a video file, a ${WORKSPACE_NAME} folder, or --dir <workspace>.`,
      );
    }
    return found;
  }
  const target = resolve(cwd, path);
  if (!existsSync(target)) throw new Error(`Path not found: ${target}`);
  if (!isDir(target)) {
    const sibling = join(dirname(target), WORKSPACE_NAME);
    if (!isDir(sibling)) {
      throw new Error(
        `No ${WORKSPACE_NAME} folder next to ${target}. Open the video in framecue first.`,
      );
    }
    return sibling;
  }
  if (isWorkspace(target)) return target;
  const inside = join(target, WORKSPACE_NAME);
  if (isDir(inside)) return inside;
  throw new Error(`No ${WORKSPACE_NAME} folder in ${target}`);
}
