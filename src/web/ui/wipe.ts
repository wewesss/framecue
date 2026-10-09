export const WIPE_STEP = 2;
export const WIPE_STEP_BIG = 10;

export function clampWipe(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function wipeFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return 50;
  return clampWipe(((clientX - left) / width) * 100);
}

export function wipeFromKey(key: string, current: number, shift: boolean): number | null {
  const step = shift ? WIPE_STEP_BIG : WIPE_STEP;
  if (key === "ArrowLeft") return clampWipe(current - step);
  if (key === "ArrowRight") return clampWipe(current + step);
  if (key === "Home") return 0;
  if (key === "End") return 100;
  return null;
}
