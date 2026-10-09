export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function timeToFrame(mediaTime: number, fps: number): number {
  return Math.floor(mediaTime * fps + 1e-6);
}

export function frameToSeekTime(frame: number, fps: number): number {
  return (frame + 0.5) / fps;
}

export function formatTimecode(frame: number, fps: number): string {
  const base = Math.round(fps);
  const ff = frame % base;
  const totalSeconds = Math.floor(frame / base);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(totalSeconds / 3600))}:${p(Math.floor(totalSeconds / 60) % 60)}:${p(totalSeconds % 60)}:${p(ff)}`;
}

export function itemTimecode(item: { fps: number }, frame: number): string {
  return formatTimecode(frame, item.fps);
}

export function stepTarget(
  base: number,
  pending: number | null,
  n: number,
  frameCount: number,
): number {
  return clamp(Math.round((pending ?? base) + n), 0, Math.max(frameCount - 1, 0));
}

export function reconcileShown(
  pending: number | null,
  shown: number,
): { pending: number | null; adopt: boolean } {
  if (pending === null) return { pending: null, adopt: true };
  if (shown === pending) return { pending: null, adopt: true };
  return { pending, adopt: false };
}
