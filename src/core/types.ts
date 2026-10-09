export type ItemKind = "frame" | "range" | "region";
export type ItemStatus = "todo" | "fixed" | "verified" | "reopened";

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ItemAfter {
  sha256: string;
  capturedAt: string;
  images: string[];
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
  after?: ItemAfter | null;
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

export interface TimingSnapshot {
  fps: number;
  frameCount: number;
}

export interface TimingChange {
  from: TimingSnapshot;
  to: TimingSnapshot;
}

export interface RenderSkip {
  id: string;
  reason: string;
}

export interface RenderEvent {
  sha256: string;
  info: VideoInfo;
  capturedIds: string[];
  skipped: RenderSkip[];
  timingChanged?: TimingChange;
}
