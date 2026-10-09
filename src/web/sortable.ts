export interface Slot {
  top: number;
  height: number;
}

export const DRAG_THRESHOLD = 4;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function targetIndex(center: number, slots: Slot[]): number {
  if (slots.length === 0) return 0;
  const found = slots.findIndex((slot) => center < slot.top + slot.height);
  return found < 0 ? slots.length - 1 : found;
}

export function siblingShift(index: number, from: number, to: number, size: number): number {
  if (from < to && index > from && index <= to) return -size;
  if (from > to && index >= to && index < from) return size;
  return 0;
}

export function clampOffset(
  offset: number,
  itemTop: number,
  itemHeight: number,
  minTop: number,
  maxBottom: number,
): number {
  const min = minTop - itemTop;
  const max = Math.max(min, maxBottom - itemHeight - itemTop);
  return clamp(offset, min, max);
}

export function autoScrollSpeed(
  pointerY: number,
  top: number,
  bottom: number,
  zone = 56,
  max = 16,
): number {
  if (pointerY < top + zone) return -max * Math.min(1, (top + zone - pointerY) / zone);
  if (pointerY > bottom - zone) return max * Math.min(1, (pointerY - (bottom - zone)) / zone);
  return 0;
}

export function mapFilteredToFull(
  fullIds: string[],
  visibleIds: string[],
  id: string,
  to: number,
): string[] {
  const from = visibleIds.indexOf(id);
  if (from < 0 || to === from || !fullIds.includes(id)) return fullIds;
  const rest = visibleIds.filter((x) => x !== id);
  const without = fullIds.filter((x) => x !== id);
  const anchor = to > from ? rest[Math.min(to, rest.length) - 1] : rest[Math.max(to, 0)];
  if (anchor === undefined) return fullIds;
  const at = without.indexOf(anchor) + (to > from ? 1 : 0);
  return [...without.slice(0, at), id, ...without.slice(at)];
}

export function applyOrder<T extends { id: string; priority: number }>(
  items: T[],
  ids: string[],
): T[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);
  const rest = items.filter((it) => !ids.includes(it.id));
  return [...ordered, ...rest].map((it, index) => ({ ...it, priority: index }));
}
