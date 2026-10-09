import type { Region } from "../../core/types";
import { clamp } from "../frame";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const MIN_REGION = 0.005;

interface Edges {
  l: number;
  t: number;
  r: number;
  b: number;
}

function toEdges(region: Region): Edges {
  return { l: region.x, t: region.y, r: region.x + region.w, b: region.y + region.h };
}

function fromEdges(edges: Edges): Region {
  const l = clamp(Math.min(edges.l, edges.r), 0, 1);
  const r = clamp(Math.max(edges.l, edges.r), 0, 1);
  const t = clamp(Math.min(edges.t, edges.b), 0, 1);
  const b = clamp(Math.max(edges.t, edges.b), 0, 1);
  return { x: l, y: t, w: r - l, h: b - t };
}

export function drawRegion(from: { x: number; y: number }, to: { x: number; y: number }): Region {
  return fromEdges({ l: from.x, t: from.y, r: to.x, b: to.y });
}

export function moveRegion(start: Region, dx: number, dy: number): Region {
  return {
    x: clamp(start.x + dx, 0, 1 - start.w),
    y: clamp(start.y + dy, 0, 1 - start.h),
    w: start.w,
    h: start.h,
  };
}

export function resizeRegion(start: Region, handle: Handle, dx: number, dy: number): Region {
  const edges = toEdges(start);
  if (handle.includes("w")) edges.l += dx;
  if (handle.includes("e")) edges.r += dx;
  if (handle.includes("n")) edges.t += dy;
  if (handle.includes("s")) edges.b += dy;
  return fromEdges(edges);
}

export function isUsable(region: Region): boolean {
  return region.w >= MIN_REGION && region.h >= MIN_REGION;
}

export function regionPixels(region: Region, width: number, height: number) {
  return { w: Math.round(region.w * width), h: Math.round(region.h * height) };
}
