import { clamp } from "../frame";

export const SNAP_PX = 8;

export interface SnapInput {
  pos: number;
  ppf: number;
  count: number;
  targets: readonly number[];
  minor: number;
  enabled: boolean;
}

export interface SnapResult {
  frame: number;
  hit: boolean;
  tick: boolean;
}

export type SnapExclude = "in" | "out" | "playhead";

export interface ItemSpan {
  start: number;
  end: number;
}

export function snapFrame(input: SnapInput): SnapResult {
  const { pos, ppf, count, targets, minor, enabled } = input;
  const last = Math.max(count - 1, 0);
  const free = clamp(Math.floor(pos), 0, last);
  if (!enabled) return { frame: free, hit: false, tick: false };
  let best: number | null = null;
  let bestDistance = SNAP_PX + 0.001;
  for (const target of targets) {
    const distance = Math.abs(target - pos) * ppf;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }
  if (best !== null) return { frame: best, hit: true, tick: false };
  if (minor <= 1) return { frame: free, hit: false, tick: false };
  return { frame: clamp(Math.round(pos / minor) * minor, 0, last), hit: true, tick: true };
}

export interface TargetSources {
  items: readonly ItemSpan[];
  inFrame: number | null;
  outFrame: number | null;
  playhead: number;
  count: number;
  exclude: readonly SnapExclude[];
}

export function snapTargets(sources: TargetSources): number[] {
  const { items, inFrame, outFrame, playhead, count, exclude } = sources;
  const targets = [0, Math.max(count - 1, 0)];
  for (const item of items) targets.push(item.start, item.end);
  if (!exclude.includes("in") && inFrame !== null) targets.push(inFrame);
  if (!exclude.includes("out") && outFrame !== null) targets.push(outFrame);
  if (!exclude.includes("playhead")) targets.push(playhead);
  return targets;
}

export interface Bracket {
  inFrame: number | null;
  outFrame: number | null;
}

export function moveBracket(current: Bracket, which: "in" | "out", frame: number): Bracket {
  const next: Bracket =
    which === "in" ? { ...current, inFrame: frame } : { ...current, outFrame: frame };
  if (next.inFrame !== null && next.outFrame !== null && next.inFrame > next.outFrame) {
    return { inFrame: next.outFrame, outFrame: next.inFrame };
  }
  return next;
}

export function rangeFrom(anchor: number, frame: number): Bracket {
  return { inFrame: Math.min(anchor, frame), outFrame: Math.max(anchor, frame) };
}
