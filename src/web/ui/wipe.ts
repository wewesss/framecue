import { compile } from "matchigo";

export const WIPE_STEP = 2;
export const WIPE_STEP_BIG = 10;

export function clampWipe(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function wipeFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return 50;
  return clampWipe(((clientX - left) / width) * 100);
}

interface WipeKey {
  key: string;
  current: number;
  step: number;
}

const wipeKey = compile<WipeKey, number | null>([
  { with: { key: "ArrowLeft" }, then: ({ current, step }: WipeKey) => clampWipe(current - step) },
  { with: { key: "ArrowRight" }, then: ({ current, step }: WipeKey) => clampWipe(current + step) },
  { with: { key: "Home" }, then: 0 },
  { with: { key: "End" }, then: 100 },
  { otherwise: null },
]);

export function wipeFromKey(key: string, current: number, shift: boolean): number | null {
  return wipeKey({ key, current, step: shift ? WIPE_STEP_BIG : WIPE_STEP });
}
