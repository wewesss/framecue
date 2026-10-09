import { clamp, type Rect } from "../frame";

export const MARGIN_X = 48;
export const MARGIN_Y = 64;
export const MAX_SCALE = 8;
const WHEEL_RATE = 0.0022;

export interface Box {
  w: number;
  h: number;
}

export interface Pan {
  x: number;
  y: number;
}

export interface VideoSize {
  width: number;
  height: number;
}

export type ZoomPreset = "fit" | "100" | "200";

export const NO_PAN: Pan = { x: 0, y: 0 };

export function fitScale(box: Box, video: VideoSize): number {
  if (video.width <= 0 || video.height <= 0) return 1;
  const scale = Math.min((box.w - MARGIN_X) / video.width, (box.h - MARGIN_Y) / video.height);
  return Math.max(scale, 0.01);
}

export function pictureRect(box: Box, video: VideoSize, scale: number, pan: Pan): Rect {
  const w = video.width * scale;
  const h = video.height * scale;
  return { x: (box.w - w) / 2 + pan.x, y: (box.h - h) / 2 + pan.y, w, h };
}

function limit(size: number, boxSize: number, margin: number): number {
  return size > boxSize ? (size - boxSize) / 2 + margin / 2 : 0;
}

export function clampPan(pan: Pan, box: Box, video: VideoSize, scale: number): Pan {
  const maxX = limit(video.width * scale, box.w, MARGIN_X);
  const maxY = limit(video.height * scale, box.h, MARGIN_Y);
  return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) };
}

export function canPan(box: Box, video: VideoSize, scale: number): boolean {
  return video.width * scale > box.w || video.height * scale > box.h;
}

export function zoomAtPoint(
  scale: number,
  next: number,
  pan: Pan,
  point: { x: number; y: number },
): Pan {
  const ratio = next / scale;
  return { x: point.x - (point.x - pan.x) * ratio, y: point.y - (point.y - pan.y) * ratio };
}

export function wheelScale(scale: number, deltaY: number, fit: number): number {
  return clamp(scale * Math.exp(-deltaY * WHEEL_RATE), fit, Math.max(MAX_SCALE, fit));
}

export function presetScale(preset: ZoomPreset, fit: number): number {
  if (preset === "100") return Math.max(1, fit);
  if (preset === "200") return Math.max(2, fit);
  return fit;
}

export function activePreset(scale: number, fit: number): ZoomPreset | null {
  if (Math.abs(scale - fit) < 1e-6) return "fit";
  if (Math.abs(scale - 1) < 1e-6) return "100";
  if (Math.abs(scale - 2) < 1e-6) return "200";
  return null;
}

export function percent(scale: number): number {
  return Math.round(scale * 100);
}
