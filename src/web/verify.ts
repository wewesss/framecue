import type { Item } from "../core/types";

export function needsVerification(item: Item): boolean {
  return item.status === "fixed" && item.after != null;
}

export function verifyCount(items: readonly Item[]): number {
  return items.filter(needsVerification).length;
}

export function nextToVerify(sorted: readonly Item[], currentId: string): Item | null {
  const index = sorted.findIndex((item) => item.id === currentId);
  const ordered = [...sorted.slice(index + 1), ...sorted.slice(0, Math.max(index, 0))];
  return ordered.find(needsVerification) ?? null;
}
