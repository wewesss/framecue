import { clamp } from "../frame";

export const MAX_PPF = 24;
export const ZOOM_STEP = 1.6;
export const LONG_PRESS_PPF = 14;
const WHEEL_RATE = 0.0022;

export interface View {
  v0: number;
  v1: number;
}

export interface RawView {
  v0: number;
  span: number;
}

export const FIT_VIEW: RawView = { v0: 0, span: Number.POSITIVE_INFINITY };

export function minSpan(count: number, width: number): number {
  return Math.min(count, Math.max(4, width / MAX_PPF));
}

export function makeView(raw: RawView, count: number, width: number): View {
  if (count <= 0) return { v0: 0, v1: 1 };
  const span = clamp(raw.span, minSpan(count, width), count);
  const v0 = clamp(raw.v0, 0, count - span);
  return { v0, v1: v0 + span };
}

export function spanOf(view: View): number {
  return view.v1 - view.v0;
}

export function isFit(view: View, count: number): boolean {
  return spanOf(view) >= count - 1e-6;
}

export function zoomFactor(view: View, count: number): number {
  return count / spanOf(view);
}

export function atMaxZoom(view: View, width: number): boolean {
  return width / spanOf(view) >= MAX_PPF - 0.01;
}

export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_RATE);
}

export function zoomAround(
  view: View,
  factor: number,
  anchor: number,
  count: number,
  width: number,
): RawView {
  const span = spanOf(view);
  const ratio = (anchor - view.v0) / span;
  const next = clamp(span / factor, minSpan(count, width), count);
  return { v0: anchor - ratio * next, span: next };
}

export function panBy(view: View, frames: number): RawView {
  return { v0: view.v0 + frames, span: spanOf(view) };
}

export function wheelPanFrames(delta: number, view: View, width: number): number {
  return (delta * spanOf(view)) / Math.max(1, width);
}

export function followPlayhead(
  view: View,
  frame: number,
  playing: boolean,
  count: number,
): RawView | null {
  const span = spanOf(view);
  if (span >= count - 1e-6) return null;
  if (frame >= view.v0 && frame < view.v1) return null;
  return { v0: playing ? frame - span * 0.05 : frame - span / 2, span };
}

export function longPressView(anchor: number, xRatio: number, width: number): RawView {
  const span = width / LONG_PRESS_PPF;
  return { v0: anchor - xRatio * span, span };
}

export function overviewPan(pointerFrame: number, grab: number, view: View): RawView {
  return { v0: pointerFrame - grab, span: spanOf(view) };
}

export function formatFactor(k: number, decimal: string): string {
  if (k < 9.95) return (Math.round(k * 10) / 10).toString().replace(".", decimal);
  return String(Math.round(k));
}
