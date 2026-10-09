import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { type Fixtures, makeFixtures } from "../core/fixtures";
import { sha256File } from "../core/hash";
import { probeVideo } from "../core/probe";
import { createItem, resolveWorkspace, updateItem } from "../core/queue";
import type { Item } from "../core/types";
import { startServer } from "../server/server";
import { resolveMcpWorkspace } from "./workspace";

const cli = join(import.meta.dir, "..", "cli.ts");

let fx: Fixtures;
let root: string;
let client: Client;
let todoItem: Item;
let rangeItem: Item;
let verifiedItem: Item;
let tmp: string;

type Content = { type: string; text?: string; data?: string; mimeType?: string };

function contentOf(result: unknown): Content[] {
  return (result as { content: Content[] }).content;
}

function isPng(base64: string): boolean {
  const bytes = Buffer.from(base64, "base64");
  return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

beforeAll(async () => {
  fx = await makeFixtures();
  tmp = await mkdtemp(join(tmpdir(), "framecue-mcp-"));
  ({ root } = await resolveWorkspace(fx.cfr, join(tmp, "ws")));
  const info = await probeVideo(fx.cfr);
  const sha = await sha256File(fx.cfr);
  const base = { video: info, sha256: sha };
  todoItem = await createItem(root, { ...base, kind: "frame", frameStart: 4, comment: "logo off" });
  rangeItem = await createItem(root, {
    ...base,
    kind: "range",
    frameStart: 10,
    frameEnd: 30,
    comment: "text overlaps",
  });
  verifiedItem = await createItem(root, {
    ...base,
    kind: "region",
    frameStart: 2,
    region: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    comment: "done long ago",
  });
  await updateItem(root, verifiedItem.id, { status: "verified" });

  client = new Client({ name: "framecue-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [cli, "mcp", root] }),
  );
}, 60_000);

afterAll(async () => {
  await client?.close();
  await fx.cleanup();
  await rm(tmp, { recursive: true, force: true });
});

describe("framecue mcp over stdio", () => {
  test("lists the four tools and nothing that can verify or delete", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_item",
      "list_items",
      "mark_fixed",
      "next_item",
    ]);
    for (const tool of tools) expect(tool.description?.length ?? 0).toBeGreaterThan(40);
    expect(client.getServerVersion()?.name).toBe("framecue");
  });

  test("list_items text and structured content", async () => {
    const all = await client.callTool({ name: "list_items", arguments: {} });
    const lines = (contentOf(all)[0]?.text ?? "").split("\n");
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain(`#1 ${todoItem.id} frame frame 4`);
    expect(lines[1]).toContain("frames 10-30");
    expect(lines[2]).toContain("[verified]");
    const structured = all.structuredContent as { items: { id: string; rank: number }[] };
    expect(structured.items.map((i) => i.id)).toEqual([todoItem.id, rangeItem.id, verifiedItem.id]);

    const todo = await client.callTool({ name: "list_items", arguments: { status: "todo" } });
    expect((todo.structuredContent as { items: unknown[] }).items.length).toBe(2);
    const fixed = await client.callTool({ name: "list_items", arguments: { status: "fixed" } });
    expect(contentOf(fixed)[0]?.text).toBe("No matching item.");
  });

  test("next_item returns the top item with images", async () => {
    const result = await client.callTool({ name: "next_item", arguments: {} });
    const content = contentOf(result);
    expect(content[0]?.text).toContain(`- id: ${todoItem.id}`);
    expect(content[0]?.text).toContain("### #1 · frame");
    const images = content.filter((c) => c.type === "image");
    expect(images.length).toBe(1);
  });

  test("get_item returns Markdown and valid PNG blocks, labelled", async () => {
    const result = await client.callTool({ name: "get_item", arguments: { id: rangeItem.id } });
    const content = contentOf(result);
    expect(content[0]?.text).toContain("### #2 · range · frames 10–30");
    const images = content.filter((c) => c.type === "image");
    expect(images.length).toBe(4);
    for (const image of images) {
      expect(image.mimeType).toBe("image/png");
      expect(isPng(image.data as string)).toBe(true);
    }
    const labels = content.filter((c) => c.type === "text" && c.text?.startsWith("Before:"));
    expect(labels.map((l) => l.text)).toEqual([
      "Before: first.png",
      "Before: middle.png",
      "Before: last.png",
      "Before: sheet.png",
    ]);
    const missing = await client.callTool({ name: "get_item", arguments: { id: "nope" } });
    expect(missing.isError).toBe(true);
  });

  test("mark_fixed: todo to fixed, then refused", async () => {
    const ok = await client.callTool({
      name: "mark_fixed",
      arguments: { id: todoItem.id, note: "removed the logo layer" },
    });
    expect(ok.isError).toBeFalsy();
    const item = (ok.structuredContent as { item: { status: string; agentNote: string } }).item;
    expect(item.status).toBe("fixed");
    expect(item.agentNote).toBe("removed the logo layer");

    const again = await client.callTool({
      name: "mark_fixed",
      arguments: { id: todoItem.id, note: "again" },
    });
    expect(again.isError).toBe(true);
    expect(contentOf(again)[0]?.text).toContain("Only the user can verify or reopen");

    const verified = await client.callTool({
      name: "mark_fixed",
      arguments: { id: verifiedItem.id, note: "x" },
    });
    expect(verified.isError).toBe(true);
    expect(contentOf(verified)[0]?.text).toContain("is verified");

    const unknown = await client.callTool({
      name: "mark_fixed",
      arguments: { id: "nope", note: "x" },
    });
    expect(unknown.isError).toBe(true);

    const next = await client.callTool({ name: "next_item", arguments: {} });
    expect(contentOf(next)[0]?.text).toContain(`- id: ${rangeItem.id}`);
  });

  test("a reopened item can be marked fixed again and the queue empties", async () => {
    await updateItem(root, todoItem.id, { status: "reopened" });
    const next = await client.callTool({ name: "next_item", arguments: {} });
    expect(contentOf(next)[0]?.text).toContain(`- id: ${todoItem.id}`);
    for (const id of [todoItem.id, rangeItem.id]) {
      const done = await client.callTool({ name: "mark_fixed", arguments: { id, note: "ok" } });
      expect(done.isError).toBeFalsy();
    }
    const empty = await client.callTool({ name: "next_item", arguments: {} });
    expect(contentOf(empty)[0]?.text).toContain("Queue empty");
  });
});

describe("player live update", () => {
  test("mark_fixed from the MCP process reaches the SSE stream", async () => {
    const info = await probeVideo(fx.cfr);
    const sha = await sha256File(fx.cfr);
    const { root: live } = await resolveWorkspace(fx.cfr, join(tmp, "live"));
    const item = await createItem(live, {
      video: info,
      sha256: sha,
      kind: "frame",
      frameStart: 6,
      comment: "live",
    });
    const running = await startServer({ videoPath: fx.cfr, workspaceDir: live, port: 0 });
    const controller = new AbortController();
    const second = new Client({ name: "framecue-test-2", version: "0.0.0" });
    try {
      const res = await fetch(`${running.url}/api/events`, { signal: controller.signal });
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const pump = (async () => {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value);
        }
      })().catch(() => undefined);
      const until = async (needle: string, ms: number) => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline && !buffer.includes(needle)) await Bun.sleep(50);
        return buffer.includes(needle);
      };
      expect(await until("connected", 2000)).toBe(true);

      await second.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [cli, "mcp", fx.cfr, "--dir", live],
        }),
      );
      const done = await second.callTool({
        name: "mark_fixed",
        arguments: { id: item.id, note: "live fix" },
      });
      expect(done.isError).toBeFalsy();
      expect(await until("event: items", 4000)).toBe(true);

      const list = (await (await fetch(`${running.url}/api/items`)).json()) as Item[];
      expect(list[0]?.status).toBe("fixed");
      expect(list[0]?.agentNote).toBe("live fix");
      controller.abort();
      await pump;
    } finally {
      await second.close();
      running.stop();
    }
  }, 30_000);
});

describe("workspace resolution", () => {
  test("video file, folder, .framecue and upward search", async () => {
    const project = join(tmp, "proj");
    await mkdir(join(project, ".framecue"), { recursive: true });
    await mkdir(join(project, "sub", "deeper"), { recursive: true });
    const video = join(project, "clip.mp4");
    await Bun.write(video, "x");
    const expected = join(project, ".framecue");
    expect(resolveMcpWorkspace({ path: video, cwd: tmp })).toBe(expected);
    expect(resolveMcpWorkspace({ path: project, cwd: tmp })).toBe(expected);
    expect(resolveMcpWorkspace({ path: expected, cwd: tmp })).toBe(expected);
    expect(resolveMcpWorkspace({ cwd: join(project, "sub", "deeper") })).toBe(expected);
    expect(resolveMcpWorkspace({ dir: expected, cwd: tmp })).toBe(expected);
    expect(() => resolveMcpWorkspace({ path: join(tmp, "missing"), cwd: tmp })).toThrow(
      "not found",
    );
    expect(() => resolveMcpWorkspace({ path: join(project, "sub"), cwd: tmp })).toThrow(
      "No .framecue",
    );
  });

  test("the CLI reports a missing workspace on stderr only", async () => {
    const empty = await mkdtemp(join(tmpdir(), "framecue-nows-"));
    try {
      const proc = Bun.spawn([process.execPath, cli, "mcp"], {
        cwd: empty,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(code).toBe(1);
      expect(out).toBe("");
      expect(err).toContain("No .framecue folder found");
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
