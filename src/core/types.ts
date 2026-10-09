export type ItemKind = "frame" | "range" | "region";
export type ItemStatus = "todo" | "fixed" | "verified" | "reopened";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Item {
  id: string;
  video: { path: string; sha256: string };
  fps: number;
  kind: ItemKind;
  frameStart: number;
  frameEnd: number;
  timecode: string;
  region?: Region | null;
  comment: string;
  priority: number;
  status: ItemStatus;
  images: string[];
  agentNote: string | null;
  createdAt: string;
  updatedAt: string;
  adapter?: Record<string, unknown>;
}

export interface VideoInfo {
  path: string;
  width: number;
  height: number;
  fps: number;
  fpsFraction: string;
  frameCount: number;
  durationSec: number;
  codec: string;
  vfr: boolean;
  audio: AudioInfo | null;
}

export interface AudioInfo {
  codec: string;
  sampleRate: number;
  channels: number;
  channelLayout: string | null;
}
