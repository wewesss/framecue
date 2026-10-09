import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { defaultExportSet, type ExportContext, rankMap, toJsonl, toMarkdown } from "./export";
import type { Item } from "./types";

const WS = "C:Videosclip.framecue";
const ctx: ExportContext = {
  video: { path: "C:Videosclipclip.mp4", width: 1920, height: 1080, fps: 25, frameCount: 250 },
  workspace: WS,
};

function item(id: string, priority: number, over: Partial<Item> = {}): Item {
  return {
    id,
    video: { path: ctx.video.path, sha256: "abc" },
    fps: 25,
    kind: "frame",
    frameStart: 10,
    frameEnd: 10,
    timecode: "00:00:00:10",
    region: null,
    comment: `comment ${id}`,
    priority,
    status: "todo",
    images: [`frames/${id}/frame.png`],
    after: null,
    agentNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const items: Item[] = [
  item("c", 2, { status: "verified" }),
  item("a", 0, {
    kind: "range",
    frameStart: 5,
    frameEnd: 30,
    timecode: "00:00:00:05",
    images: [
      "frames/a/first.png",
      "frames/a/middle.png",
      "frames/a/last.png",
      "frames/a/sheet.png",
    ],
    comment: "Overlap\nsecond line",
  }),
  item("b", 1, {
    kind: "region",
    status: "reopened",
    region: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 },
    after: {
      sha256: "deadbeef00112233",
      capturedAt: "2026-01-02T00:00:00.000Z",
      images: ["frames/b/after-deadbeef/frame.png"],
    },
    agentNote: "moved the title",
  }),
];

describe("default set", () => {
  test("todo and reopened, by priority", () => {
    expect(defaultExportSet(items).map((i) => i.id)).toEqual(["a", "b"]);
  });

  test("ranks follow priority", () => {
    expect([...rankMap(items)]).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });
});

describe("toMarkdown", () => {
  const md = toMarkdown(items, ctx);

  test("header", () => {
    expect(md).toContain(`Video: ${resolve(ctx.video.path)}`);
    expect(md).toContain("Resolution: 1920x1080 · 25 fps · 250 frames");
    expect(md).toContain(`Workspace: ${resolve(WS)}`);
    expect(md).toContain("mark_fixed(id, note)");
  });

  test("sections follow priority", () => {
    const heads = md.split("\n").filter((l) => l.startsWith("### "));
    expect(heads).toEqual([
      "### #1 · range · frames 5–30 (00:00:00:05)",
      "### #2 · region · frame 10 (00:00:00:10)",
      "### #3 · frame · frame 10 (00:00:00:10)",
    ]);
  });

  test("details", () => {
    expect(md).toContain("- id: a");
    expect(md).toContain("- status: reopened");
    expect(md).toContain("  > Overlap\n  > second line");
    expect(md).toContain(
      "Region (normalised 0–1): x=0.25 y=0.5 w=0.5 h=0.25; in source pixels (1920x1080): x=480 y=540 w=960 h=270",
    );
    expect(md).toContain(`  - contact sheet: ${resolve(WS, "frames/a/sheet.png")}`);
    expect(md).toContain("- images (after, render deadbeef):");
    expect(md).toContain(`  - frame 10: ${resolve(WS, "frames/b/after-deadbeef/frame.png")}`);
    expect(md).toContain("- agent note: moved the title");
  });

  test("explicit ranks override position", () => {
    const only = toMarkdown([items[2] as Item], { ...ctx, ranks: rankMap(items) });
    expect(only).toContain("### #2 · region");
  });

  test("image paths are absolute", () => {
    const paths = [...md.matchAll(/: (.+\.png)$/gm)].map((m) => m[1] as string);
    expect(paths.length).toBe(7);
    for (const p of paths) expect(p).toBe(resolve(p));
  });
});

describe("toJsonl", () => {
  test("one object per line with absolute paths", () => {
    const lines = toJsonl(items, ctx).split("\n");
    expect(lines.pop()).toBe("");
    const rows = lines.map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(rows[0].videoAbs).toBe(resolve(ctx.video.path));
    expect(rows[0].imagesAbs[3]).toBe(resolve(WS, "frames/a/sheet.png"));
    expect(rows[1].afterImagesAbs).toEqual([resolve(WS, "frames/b/after-deadbeef/frame.png")]);
    expect(rows[2].afterImagesAbs).toEqual([]);
    expect(rows[1].images).toEqual(["frames/b/frame.png"]);
    expect(rows[1].agentNote).toBe("moved the title");
  });

  test("empty set gives an empty string", () => {
    expect(toJsonl([], ctx)).toBe("");
  });
});
