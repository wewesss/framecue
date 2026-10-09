import { compile } from "matchigo";
import type { AudioInfo, Item } from "../core/types";
import type { TKey } from "./i18n/core";

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function aspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "";
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;
  if (w > 40 || h > 40) return `${(width / height).toFixed(2)}:1`;
  return `${w}:${h}`;
}

export function fpsValue(fps: number): string {
  return String(Number(fps.toFixed(3)));
}

const videoCodec = compile<string, string>([
  { with: "h264", then: "H.264" },
  { with: "hevc", then: "H.265" },
  { with: "vp8", then: "VP8" },
  { with: "vp9", then: "VP9" },
  { with: "av1", then: "AV1" },
  { with: "prores", then: "ProRes" },
  { with: "mpeg4", then: "MPEG-4" },
  { otherwise: (codec) => codec.toUpperCase() },
]);

export function videoCodecLabel(codec: string): string {
  return videoCodec(codec.toLowerCase());
}

export function audioCodecLabel(codec: string): string {
  return codec.toUpperCase();
}

export function sampleRateLabel(sampleRate: number): string {
  return `${Number((sampleRate / 1000).toFixed(1))} kHz`;
}

export const channelsKey = compile<number, TKey | null>([
  { with: 1, then: "audio.mono" },
  { with: 2, then: "audio.stereo" },
  { otherwise: null },
]);

export function audioMetaParts(audio: AudioInfo): [string, string] {
  return [audioCodecLabel(audio.codec), sampleRateLabel(audio.sampleRate)];
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function joinPath(directory: string, name: string): string {
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  const trimmed = directory.replace(/[\\/]+$/, "");
  return `${trimmed}${separator}${name}`;
}

export interface Age {
  unit: "minute" | "hour" | "day";
  value: number;
}

export function ageSince(iso: string, now: number): Age | null {
  const seconds = Math.floor((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) return null;
  if (seconds < 3600) return { unit: "minute", value: Math.floor(seconds / 60) };
  if (seconds < 86400) return { unit: "hour", value: Math.floor(seconds / 3600) };
  return { unit: "day", value: Math.floor(seconds / 86400) };
}

export interface CaptureTile {
  image: string;
  label: TKey;
  frame: number | null;
  sheet: boolean;
}

const CAPTURE_ORDER = ["frame.png", "first.png", "middle.png", "last.png", "sheet.png"];

interface TileRef {
  name: string;
  image: string;
  item: Pick<Item, "frameStart" | "frameEnd">;
}

const captureTile = compile<TileRef, CaptureTile>([
  {
    with: { name: "frame.png" },
    then: ({ image, item }: TileRef): CaptureTile => ({
      image,
      label: "cap.frame",
      frame: item.frameStart,
      sheet: false,
    }),
  },
  {
    with: { name: "first.png" },
    then: ({ image, item }: TileRef): CaptureTile => ({
      image,
      label: "cap.in",
      frame: item.frameStart,
      sheet: false,
    }),
  },
  {
    with: { name: "middle.png" },
    then: ({ image, item }: TileRef): CaptureTile => ({
      image,
      label: "cap.middle",
      frame: Math.floor((item.frameStart + item.frameEnd) / 2),
      sheet: false,
    }),
  },
  {
    with: { name: "last.png" },
    then: ({ image, item }: TileRef): CaptureTile => ({
      image,
      label: "cap.out",
      frame: item.frameEnd,
      sheet: false,
    }),
  },
  {
    otherwise: ({ image }: TileRef): CaptureTile => ({
      image,
      label: "cap.sheet",
      frame: null,
      sheet: true,
    }),
  },
]);

export function captureTiles(
  item: Pick<Item, "images" | "frameStart" | "frameEnd">,
): CaptureTile[] {
  const byName = new Map(item.images.map((image) => [image.split("/").pop() ?? image, image]));
  const tiles: CaptureTile[] = [];
  for (const name of CAPTURE_ORDER) {
    const image = byName.get(name);
    if (!image) continue;
    tiles.push(captureTile({ name, image, item }));
  }
  return tiles;
}

export function shortTimecode(timecode: string): string {
  return timecode.slice(3);
}
