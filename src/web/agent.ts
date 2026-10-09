import type { Item } from "../core/types";

export function agentFixedItems(previous: Item[], next: Item[]): Item[] {
  const before = new Map(previous.map((it) => [it.id, it]));
  return next.filter((it) => {
    if (it.status !== "fixed" || !it.agentNote) return false;
    const old = before.get(it.id);
    return old !== undefined && old.status !== "fixed";
  });
}
