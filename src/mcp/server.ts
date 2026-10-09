import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import pkg from "../../package.json";
import {
  defaultExportSet,
  type ExportContext,
  type Item,
  itemMarkdown,
  probeVideo,
  rankMap,
  readQueue,
  updateItem,
} from "../core";

const SHEET_MAX_BYTES = 2 * 1024 * 1024;
const TOTAL_MAX_BYTES = 8 * 1024 * 1024;

const STATUS = z.enum(["todo", "fixed", "verified", "reopened"]);

const summarySchema = z.object({
  rank: z.number(),
  id: z.string(),
  kind: z.string(),
  frameStart: z.number(),
  frameEnd: z.number(),
  timecode: z.string(),
  status: STATUS,
  comment: z.string(),
  agentNote: z.string().nullable(),
});

type Summary = z.infer<typeof summarySchema>;

function summarise(item: Item, ranks: Map<string, number>): Summary {
  return {
    rank: ranks.get(item.id) ?? 0,
    id: item.id,
    kind: item.kind,
    frameStart: item.frameStart,
    frameEnd: item.frameEnd,
    timecode: item.timecode,
    status: item.status,
    comment: item.comment,
    agentNote: item.agentNote,
  };
}

function framesText(s: Summary): string {
  return s.frameEnd > s.frameStart
    ? `frames ${s.frameStart}-${s.frameEnd}`
    : `frame ${s.frameStart}`;
}

function listLine(s: Summary): string {
  const first = s.comment.split(/\r?\n/)[0]?.trim() || "(no comment)";
  return `#${s.rank} ${s.id} ${s.kind} ${framesText(s)} (${s.timecode}) [${s.status}] ${first}`;
}

function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

export function createFramecueServer(root: string): McpServer {
  const server = new McpServer({ name: "framecue", version: pkg.version });
  const videoCache = new Map<string, ExportContext["video"]>();

  const context = async (items: Item[]): Promise<ExportContext> => {
    const first = items[0];
    const path = first?.video.path ?? "";
    let video = videoCache.get(path);
    if (!video) {
      try {
        const info = await probeVideo(path);
        video = {
          path: info.path,
          width: info.width,
          height: info.height,
          fps: info.fps,
          frameCount: info.frameCount,
        };
      } catch {
        video = { path, width: 0, height: 0, fps: first?.fps ?? 0, frameCount: 0 };
      }
      if (path) videoCache.set(path, video);
    }
    return { video, workspace: root, ranks: rankMap(items) };
  };

  const itemDetails = async (all: Item[], item: Item): Promise<CallToolResult> => {
    const ctx = await context(all);
    const ranks = ctx.ranks as Map<string, number>;
    const content: CallToolResult["content"] = [
      { type: "text", text: itemMarkdown(ctx, item, ranks.get(item.id) ?? 0) },
    ];
    let total = 0;
    const notes: string[] = [];
    const attach = async (label: string, rel: string) => {
      const name = rel.split("/").pop() ?? rel;
      let data: Buffer;
      try {
        data = await readFile(join(root, ...rel.split("/")));
      } catch {
        notes.push(`${label} (${name}): file missing, skipped.`);
        return;
      }
      if (name === "sheet.png" && data.length > SHEET_MAX_BYTES) {
        notes.push(
          `${label} (${name}): contact sheet is ${data.length} bytes, skipped (over 2 MB).`,
        );
        return;
      }
      if (total + data.length > TOTAL_MAX_BYTES) {
        notes.push(`${label} (${name}): skipped, image payload limit reached (8 MB).`);
        return;
      }
      total += data.length;
      content.push({ type: "text", text: `${label}: ${name}` });
      content.push({ type: "image", data: data.toString("base64"), mimeType: "image/png" });
    };
    for (const rel of item.images) await attach("Before", rel);
    if (item.after) for (const rel of item.after.images) await attach("After", rel);
    if (notes.length > 0) content.push({ type: "text", text: notes.join("\n") });
    return { content };
  };

  server.registerTool(
    "list_items",
    {
      title: "List review items",
      description:
        "List the items of the framecue review queue, ordered by priority (rank #1 is the most urgent). Optionally filter by status: todo (waiting for a fix), fixed (marked fixed, waiting for the user to verify), verified (approved by the user), reopened (still wrong, needs another fix). Returns one line per item and the same data as structured content. Use get_item for the images.",
      inputSchema: { status: STATUS.optional().describe("Only items with this status") },
      outputSchema: { items: z.array(summarySchema) },
      annotations: { readOnlyHint: true },
    },
    async ({ status }) => {
      const all = await readQueue(root);
      const ranks = rankMap(all);
      const items = all
        .filter((it) => status === undefined || it.status === status)
        .map((it) => summarise(it, ranks));
      const body = items.length > 0 ? items.map(listLine).join("\n") : "No matching item.";
      return { content: [{ type: "text", text: body }], structuredContent: { items } };
    },
  );

  server.registerTool(
    "next_item",
    {
      title: "Get the next item to fix",
      description:
        "Return the highest-priority item whose status is todo or reopened, with full details and its images (same output as get_item). Returns a plain message when nothing is waiting for a fix.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const all = await readQueue(root);
      const next = defaultExportSet(all)[0];
      if (!next) return text("Queue empty: no item is todo or reopened.");
      return itemDetails(all, next);
    },
  );

  server.registerTool(
    "get_item",
    {
      title: "Get one item",
      description:
        "Return the full details of one item: kind, frames and timecode, comment, region (normalised and in source pixels), status, agent note, absolute image paths, and the images themselves as PNG (before; plus after-render images when available). The contact sheet is skipped when larger than 2 MB.",
      inputSchema: { id: z.string().min(1).describe("Item id, e.g. fc_xxxxxxxx") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const all = await readQueue(root);
      const item = all.find((it) => it.id === id);
      if (!item) return toolError(`Item not found: ${id}`);
      return itemDetails(all, item);
    },
  );

  server.registerTool(
    "mark_fixed",
    {
      title: "Mark an item fixed",
      description:
        "Report that you fixed an item: its status goes from todo or reopened to fixed and your note is stored for the user. Only these transitions are allowed; the user alone verifies or reopens items, so an item that is already fixed or verified is refused. Write the note as what you changed and where.",
      inputSchema: {
        id: z.string().min(1).describe("Item id"),
        note: z.string().min(1).describe("What you changed, shown to the user"),
      },
      outputSchema: { item: summarySchema },
    },
    async ({ id, note }) => {
      try {
        const updated = await updateItem(
          root,
          id,
          { status: "fixed", agentNote: note },
          { actor: "agent" },
        );
        const ranks = rankMap(await readQueue(root));
        const summary = summarise(updated, ranks);
        return {
          content: [{ type: "text", text: `Marked fixed: ${listLine(summary)}` }],
          structuredContent: { item: summary },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("Invalid status transition")) {
          const current = (await readQueue(root)).find((it) => it.id === id);
          return toolError(
            `Item ${id} is ${current?.status ?? "in another state"}: only todo or reopened items can be marked fixed. Only the user can verify or reopen an item.`,
          );
        }
        return toolError(message);
      }
    },
  );

  return server;
}

export async function runMcp(root: string): Promise<void> {
  const server = createFramecueServer(root);
  const transport = new StdioServerTransport();
  transport.onclose = () => process.exit(0);
  await server.connect(transport);
  console.error(`framecue mcp: serving ${root}`);
}
