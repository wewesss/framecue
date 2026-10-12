import type { Region } from "./types";

export const REGION_COLORS = [
  { name: "blue", hex: "#3b82f6", ink: "#ffffff" },
  { name: "red", hex: "#ef4444", ink: "#ffffff" },
  { name: "green", hex: "#22c55e", ink: "#06240f" },
  { name: "orange", hex: "#f97316", ink: "#2a1204" },
  { name: "purple", hex: "#a855f7", ink: "#ffffff" },
  { name: "cyan", hex: "#06b6d4", ink: "#04262d" },
] as const;

export type RegionColor = (typeof REGION_COLORS)[number];

export function regionColor(index: number): RegionColor {
  const count = REGION_COLORS.length;
  return REGION_COLORS[((index % count) + count) % count] as RegionColor;
}

export interface RegionDetail {
  number: number;
  color: string;
  normalised: Region;
  pixels: Region | null;
}

export function regionPixelRect(region: Region, width: number, height: number): Region {
  return {
    x: Math.round(region.x * width),
    y: Math.round(region.y * height),
    w: Math.round(region.w * width),
    h: Math.round(region.h * height),
  };
}

export function regionDetails(
  regions: readonly Region[],
  size: { width: number; height: number },
): RegionDetail[] {
  const known = size.width > 0 && size.height > 0;
  return regions.map((region, index) => ({
    number: index + 1,
    color: regionColor(index).name,
    normalised: { x: region.x, y: region.y, w: region.w, h: region.h },
    pixels: known ? regionPixelRect(region, size.width, size.height) : null,
  }));
}

function isRegion(value: unknown): value is Region {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((key) => typeof r[key] === "number");
}

export function normalizeRegions(raw: { regions?: unknown; region?: unknown }): Region[] {
  if (Array.isArray(raw.regions)) return raw.regions.filter(isRegion);
  return isRegion(raw.region) ? [raw.region] : [];
}
