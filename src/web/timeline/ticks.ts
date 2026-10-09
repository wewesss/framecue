import { formatTimecode } from "../frame";

export interface RulerSteps {
  label: number;
  mid: number;
  minor: number;
}

export type TickLevel = "major" | "mid" | "minor";

export interface Tick {
  frame: number;
  x: number;
  level: TickLevel;
  text: string | null;
  second: boolean;
}

export interface DivLabel {
  unit: "frames" | "seconds" | "minutes";
  value: number;
}

const LABEL_PX = 70;
const MID_PX = 16;
const MINOR_PX = 5;

function ascending(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function base(fps: number): number {
  return Math.max(1, Math.round(fps));
}

export function labelSteps(fps: number): number[] {
  const b = base(fps);
  return ascending([1, 2, 5, 10, b, 2 * b, 5 * b, 10 * b, 30 * b, 60 * b, 120 * b]);
}

export function midSteps(fps: number): number[] {
  const b = base(fps);
  return ascending([5, 10, b, 2 * b, 5 * b, 10 * b, 30 * b]);
}

export function minorSteps(fps: number): number[] {
  const b = base(fps);
  return ascending([1, 5, b, 5 * b, 10 * b, 30 * b, 60 * b]);
}

export function rulerSteps(ppf: number, fps: number): RulerSteps {
  const labels = labelSteps(fps);
  const label = labels.find((s) => s * ppf >= LABEL_PX) ?? labels[labels.length - 1] ?? 1;
  const minor = minorSteps(fps).find((s) => s * ppf >= MINOR_PX && label % s === 0) ?? label;
  const mid = midSteps(fps).find((s) => s > minor && label % s === 0 && s * ppf >= MID_PX) ?? 0;
  return { label, mid, minor };
}

export function divLabel(step: number, fps: number): DivLabel {
  const b = base(fps);
  if (step < b) return { unit: "frames", value: step };
  if (step < 60 * b) return { unit: "seconds", value: step / b };
  return { unit: "minutes", value: step / (60 * b) };
}

export function tickText(
  frame: number,
  step: number,
  fps: number,
): { text: string; second: boolean } {
  const b = base(fps);
  if (step >= b) return { text: formatTimecode(frame, fps).slice(3, 8), second: false };
  if (frame % b === 0) return { text: formatTimecode(frame, fps).slice(3), second: true };
  return { text: String(frame), second: false };
}

export function rulerTicks(
  v0: number,
  v1: number,
  width: number,
  steps: RulerSteps,
  fps: number,
): Tick[] {
  const span = v1 - v0;
  if (span <= 0 || width <= 0) return [];
  const ticks: Tick[] = [];
  const { label, mid, minor } = steps;
  for (let frame = Math.ceil(v0 / minor) * minor; frame <= v1; frame += minor) {
    const x = ((frame - v0) / span) * width;
    if (x < -1 || x > width + 1) continue;
    if (frame % label === 0) {
      const { text, second } = tickText(frame, label, fps);
      ticks.push({ frame, x, level: "major", text, second });
    } else if (mid > 0 && frame % mid === 0) {
      ticks.push({ frame, x, level: "mid", text: null, second: false });
    } else {
      ticks.push({ frame, x, level: "minor", text: null, second: false });
    }
  }
  return ticks;
}

export const TICK_HEIGHT: Record<TickLevel, number> = { major: 11, mid: 7, minor: 4 };

export const SHADE_MIN_PPF = 10;
