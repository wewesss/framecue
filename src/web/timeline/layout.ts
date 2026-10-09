import { clamp } from "../frame";

export const RULER_H = 24;
export const MARKERS_H = 22;
export const CLIP_TOP = RULER_H + MARKERS_H;
export const LANE_GAP = 3;
export const BOTTOM_PAD = 5;
export const MIN_HEIGHT = 64;
export const MAX_HEIGHT_RATIO = 0.45;

export interface LaneOptions {
  wave: boolean;
  audio: boolean;
}

export interface Lanes {
  clipH: number;
  audioH: number;
}

export function defaultHeight({ wave, audio }: LaneOptions): number {
  if (!wave) return 96;
  return audio ? 136 : 112;
}

export function maxHeight(viewportHeight: number): number {
  return Math.max(MIN_HEIGHT, viewportHeight * MAX_HEIGHT_RATIO);
}

export function clampHeight(height: number, viewportHeight: number): number {
  return clamp(height, MIN_HEIGHT, maxHeight(viewportHeight));
}

export function lanes(height: number, { wave, audio }: LaneOptions): Lanes {
  const avail = height - CLIP_TOP - BOTTOM_PAD;
  if (!wave) return { clipH: clamp(avail, 14, 48), audioH: 0 };
  let clipH: number;
  let audioH: number;
  if (audio) {
    clipH = clamp(Math.round(avail * 0.38), 16, 34);
    audioH = avail - clipH - LANE_GAP;
  } else {
    audioH = 22;
    clipH = clamp(avail - audioH - LANE_GAP, 16, 34);
  }
  if (audioH < 14) return { clipH: avail, audioH: 0 };
  return { clipH, audioH };
}
