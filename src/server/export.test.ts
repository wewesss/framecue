import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Fixtures, makeFixtures } from "../core/fixtures";
import type { Item } from "../core/types";
import { type RunningServer, startServer } from "./server";

let fx: Fixtures;
let wsDir: string;
let running: RunningServer;
let base: string;
const made: Item[] = [];

async function post(body: unknown): Promise<Item> {
  const res = await fetch(`${base}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Item;
}

beforeAll(async () => {
  fx = await makeFixtures();
  wsDir = await mkdtemp(join(tmpdir(), "framecue-export-"));
  running = await startServer({ videoPath: fx.cfr, workspaceDir: wsDir, port: 0 });
  base = running.url;
  made.push(await post({ kind: "frame", frameStart: 3, comment: "first" }));
  made.push(await post({ kind: "range", frameStart: 5, frameEnd: 20, comment: "second" }));
  made.push(
    await post({
      kind: "region",
      frameStart: 8,
      comment: "third",
      region: { x: 0.5, y: 0.5, w: 0.25, h: 0.25 },
    }),
  );
  await fetch(`${base}/api/items/${made[2]?.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "verified" }),
  });
});

afterAll(async () => {
  running.stop();
  await fx.cleanup();
  await rm(wsDir, { recursive: true, force: true });
});

describe("GET /api/export", () => {
  test("default set is markdown of todo and reopened", async () => {
    const res = await fetch(`${base}/api/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("x-framecue-count")).toBe("2");
    const text = await res.text();
    expect(text).toContain("### #1 · frame · frame 3");
    expect(text).toContain("### #2 · range · frames 5–20");
    expect(text).not.toContain("third");
    expect(text).toContain(resolve(wsDir, "frames", made[0]?.id as string, "frame.png"));
    expect(text).toContain(`Video: ${resolve(fx.cfr)}`);
    expect(text).toContain("Resolution: 160x90");
  });

  test("jsonl with explicit ids", async () => {
    const ids = `${made[2]?.id},${made[0]?.id}`;
    const res = await fetch(`${base}/api/export?format=jsonl&ids=${ids}`);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const rows = (await res.text())
      .split("\n")
      .filter((l) => l)
      .map((l) => JSON.parse(l));
    expect(rows.map((r) => r.id)).toEqual([made[0]?.id, made[2]?.id]);
    expect(rows[0].imagesAbs[0]).toBe(resolve(wsDir, "frames", made[0]?.id as string, "frame.png"));
    expect(rows[1].status).toBe("verified");
    expect(rows[0].videoAbs).toBe(resolve(fx.cfr));
  });

  test("ranks stay those of the whole queue", async () => {
    const res = await fetch(`${base}/api/export?ids=${made[1]?.id}`);
    expect(await res.text()).toContain("### #2 · range");
  });

  test("errors", async () => {
    expect((await fetch(`${base}/api/export?format=xml`)).status).toBe(400);
    expect((await fetch(`${base}/api/export?ids=nope`)).status).toBe(404);
  });

  test("host and origin rules", async () => {
    const bad = await fetch(`${base}/api/export`, { headers: { Origin: "http://evil.example" } });
    expect(bad.status).toBe(403);
    const ok = await fetch(`${base}/api/export`, { headers: { Origin: base } });
    expect(ok.status).toBe(200);
  });
});

describe("queue file watcher", () => {
  test("an external write emits an items event, an own write does not", async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: controller.signal });
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let pending: ReturnType<typeof reader.read> | null = null;
    const waitFor = async (needle: string, ms: number): Promise<boolean> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (buffer.includes(needle)) return true;
        pending ??= reader.read();
        const chunk = await Promise.race([pending, Bun.sleep(100).then(() => null)]);
        if (chunk) {
          pending = null;
          if (chunk.value) buffer += decoder.decode(chunk.value);
        }
      }
      return buffer.includes(needle);
    };
    expect(await waitFor("connected", 2000)).toBe(true);

    await fetch(`${base}/api/items/${made[0]?.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "own change" }),
    });
    expect(await waitFor("event: items", 700)).toBe(false);

    const file = join(wsDir, "queue.jsonl");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace("own change", "external change"));
    expect(await waitFor("event: items", 3000)).toBe(true);
    controller.abort();
  });
});
