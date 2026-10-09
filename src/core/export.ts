import { resolve } from "node:path";
import { compile } from "matchigo";
import type { Item } from "./types";

export interface ExportContext {
  video: { path: string; width: number; height: number; fps: number; frameCount: number };
  workspace: string;
  ranks?: Map<string, number>;
}

export type ExportFormat = "md" | "jsonl";

export const OPEN_STATUSES = ["todo", "reopened"] as const;

export function byPriority(items: Item[]): Item[] {
  return [...items].sort((a, b) => a.priority - b.priority);
}

export function rankMap(items: Item[]): Map<string, number> {
  return new Map(byPriority(items).map((item, index) => [item.id, index + 1]));
}

export function defaultExportSet(items: Item[]): Item[] {
  return byPriority(items).filter((item) => item.status === "todo" || item.status === "reopened");
}

function abs(ctx: ExportContext, rel: string): string {
  return resolve(ctx.workspace, rel);
}

interface ImageRef {
  item: Item;
  name: string;
}

const imageLabel = compile<ImageRef, string>([
  { with: { name: "frame.png" }, then: ({ item }: ImageRef) => `frame ${item.frameStart}` },
  { with: { name: "first.png" }, then: ({ item }: ImageRef) => `in, frame ${item.frameStart}` },
  {
    with: { name: "middle.png" },
    then: ({ item }: ImageRef) =>
      `middle, frame ${Math.floor((item.frameStart + item.frameEnd) / 2)}`,
  },
  { with: { name: "last.png" }, then: ({ item }: ImageRef) => `out, frame ${item.frameEnd}` },
  { with: { name: "sheet.png" }, then: "contact sheet" },
  { otherwise: ({ name }) => name },
]);

function imageLines(ctx: ExportContext, item: Item, images: string[]): string[] {
  return images.map((image) => {
    const name = image.split("/").pop() ?? image;
    return `- ${imageLabel({ item, name })}: ${abs(ctx, image)}`;
  });
}

function framesLabel(item: Item): string {
  return item.frameEnd > item.frameStart
    ? `frames ${item.frameStart}–${item.frameEnd}`
    : `frame ${item.frameStart}`;
}

function regionLine(ctx: ExportContext, item: Item): string | null {
  const r = item.region;
  if (!r) return null;
  const { width, height } = ctx.video;
  const px = (v: number, size: number) => Math.round(v * size);
  const normalised = `Region (normalised 0–1): x=${r.x} y=${r.y} w=${r.w} h=${r.h}`;
  if (!(width > 0 && height > 0)) return normalised;
  return `${normalised}; in source pixels (${width}x${height}): x=${px(r.x, width)} y=${px(r.y, height)} w=${px(r.w, width)} h=${px(r.h, height)}`;
}

function section(ctx: ExportContext, item: Item, number: number): string {
  const lines = [
    `### #${number} · ${item.kind} · ${framesLabel(item)} (${item.timecode})`,
    `- id: ${item.id}`,
    `- status: ${item.status}`,
  ];
  const comment = item.comment.trim();
  lines.push(
    comment
      ? `- comment:\n${comment
          .split(/\r?\n/)
          .map((line) => `  > ${line}`)
          .join("\n")}`
      : "- comment: (none)",
  );
  const region = regionLine(ctx, item);
  if (region) lines.push(`- ${region}`);
  lines.push("- images (before):", ...imageLines(ctx, item, item.images).map((l) => `  ${l}`));
  if (item.after && item.after.images.length > 0) {
    lines.push(
      `- images (after, render ${item.after.sha256.slice(0, 8)}):`,
      ...imageLines(ctx, item, item.after.images).map((l) => `  ${l}`),
    );
  }
  if (item.agentNote) lines.push(`- agent note: ${item.agentNote}`);
  return lines.join("\n");
}

export function itemMarkdown(ctx: ExportContext, item: Item, number: number): string {
  return section(ctx, item, number);
}

export function toMarkdown(items: Item[], ctx: ExportContext): string {
  const ordered = byPriority(items);
  const ranks = ctx.ranks ?? rankMap(ordered);
  const { video } = ctx;
  const header = [
    "# Video review items to fix",
    "",
    `Video: ${resolve(video.path)}`,
    `Resolution: ${video.width}x${video.height} · ${video.fps} fps · ${video.frameCount} frames`,
    `Workspace: ${resolve(ctx.workspace)}`,
    "Report back: after fixing an item, call the framecue MCP tool `mark_fixed(id, note)`, or tell the user. Only the user marks an item verified.",
    "",
    `${ordered.length} item(s), by priority.`,
  ];
  const body = ordered.map((item, index) => section(ctx, item, ranks.get(item.id) ?? index + 1));
  return `${[header.join("\n"), ...body].join("\n\n")}\n`;
}

export function toJsonl(items: Item[], ctx: ExportContext): string {
  return byPriority(items)
    .map((item) => {
      const record = {
        ...item,
        videoAbs: resolve(item.video.path),
        imagesAbs: item.images.map((image) => abs(ctx, image)),
        afterImagesAbs: (item.after?.images ?? []).map((image) => abs(ctx, image)),
      };
      return `${JSON.stringify(record)}\n`;
    })
    .join("");
}

export function exportItems(items: Item[], ctx: ExportContext, format: ExportFormat): string {
  return format === "md" ? toMarkdown(items, ctx) : toJsonl(items, ctx);
}
