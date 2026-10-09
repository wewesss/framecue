export const DRAG_THRESHOLD = 4;

export function passedThreshold(startX: number, x: number): boolean {
  return Math.abs(x - startX) >= DRAG_THRESHOLD;
}

export function dragProgress(
  clientX: number,
  left: number,
  width: number,
  checked: boolean,
): number {
  if (width === 0) return checked ? 1 : 0;
  return Math.min(Math.max((clientX - left) / width, 0), 1);
}

export function commitsOn(progress: number): boolean {
  return progress >= 0.5;
}

export function dragOutcome(progress: number, checked: boolean): boolean | null {
  const next = commitsOn(progress);
  return next === checked ? null : next;
}
