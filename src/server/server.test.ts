import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Fixtures, makeFixtures, renderByRename, renderClip } from "../core/fixtures";
import type { Item, RenderEvent } from "../core/types";
import { type RunningServer, startServer } from "./server";

let fx: Fixtures;
let wsDir: string;
let running: RunningServer;
let base: string;
let size: number;

beforeAll(async () => {
  fx = await makeFixtures();
  wsDir = await mkdtemp(join(tmpdir(), "framecue-ws-"));
  running = await startServer({ videoPath: fx.cfr, workspaceDir: wsDir, port: 0 });
  base = running.url;
  size = Bun.file(fx.cfr).size;
});

afterAll(async () => {
  running.stop();
  await fx.cleanup();
  await rm(wsDir, { recursive: true, force: true });
});

function rawRequest(host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const port = new URL(base).port;
    const socket = connect(Number(port), "127.0.0.1", () => {
      socket.write(`GET /api/health HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk.toString();
    });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
  });
}

function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("video", () => {
  test("health", async () => {
    const res = await send("GET", "/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("video info", async () => {
    const info = (await (await send("GET", "/api/video")).json()) as Record<string, unknown>;
    expect(info.fps).toBe(25);
    expect(info.frameCount).toBe(50);
    expect(info.vfr).toBe(false);
    expect(String(info.sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(info.workspace).toBe(running.workspace);
  });

  test("stream without Range", async () => {
    const res = await send("GET", "/api/video/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect((await res.arrayBuffer()).byteLength).toBe(size);
  });

  test("stream with Range", async () => {
    const res = await send("GET", "/api/video/stream", undefined, { Range: "bytes=0-99" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-99/${size}`);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  test("stream with unsatisfiable Range", async () => {
    const res = await send("GET", "/api/video/stream", undefined, { Range: `bytes=${size}-` });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${size}`);
  });
});

describe("audio peaks", () => {
  test("returns int8 peaks with headers", async () => {
    const res = await send("GET", "/api/audio/peaks");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-peaks-rate")).toBe("200");
    const length = Number(res.headers.get("x-peaks-length"));
    expect((await res.arrayBuffer()).byteLength).toBe(length * 2);
    expect(length).toBeGreaterThan(390);
  });

  test("concurrent requests agree", async () => {
    const [a, b] = await Promise.all([
      send("GET", "/api/audio/peaks"),
      send("GET", "/api/audio/peaks"),
    ]);
    expect(a.headers.get("x-peaks-length")).toBe(b.headers.get("x-peaks-length"));
  });

  test("404 without audio track", async () => {
    const silent = await startServer({
      videoPath: fx.silent,
      workspaceDir: join(wsDir, "s"),
      port: 0,
    });
    try {
      const res = await fetch(`${silent.url}/api/audio/peaks`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "No audio track" });
    } finally {
      silent.stop();
    }
  });
});

describe("items", () => {
  let item: Item;

  test("create", async () => {
    const res = await send("POST", "/api/items", { kind: "frame", frameStart: 5, comment: "a" });
    expect(res.status).toBe(201);
    item = (await res.json()) as Item;
    expect(item.status).toBe("todo");
    expect(item.video.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("list and filter", async () => {
    const all = (await (await send("GET", "/api/items")).json()) as Item[];
    expect(all.map((i) => i.id)).toContain(item.id);
    const fixed = (await (await send("GET", "/api/items?status=fixed")).json()) as Item[];
    expect(fixed).toEqual([]);
    expect((await send("GET", "/api/items?status=nope")).status).toBe(400);
  });

  test("frame image", async () => {
    const res = await send("GET", `/api/frames/${item.id}/frame.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect((await send("GET", `/api/frames/${item.id}/missing.png`)).status).toBe(404);
  });

  test("validation error is 400", async () => {
    const res = await send("POST", "/api/items", { kind: "frame", frameStart: 999, comment: "x" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeString();
  });

  test("patch comment", async () => {
    const res = await send("PATCH", `/api/items/${item.id}`, { comment: "b" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Item).comment).toBe("b");
  });

  test("user may set any status", async () => {
    const res = await send("PATCH", `/api/items/${item.id}`, { status: "verified" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Item).status).toBe("verified");
    const back = await send("PATCH", `/api/items/${item.id}`, { status: "todo" });
    expect(((await back.json()) as Item).status).toBe("todo");
    expect((await send("PATCH", `/api/items/${item.id}`, { status: "nope" })).status).toBe(400);
  });

  test("reorder", async () => {
    const second = (await (
      await send("POST", "/api/items", { kind: "frame", frameStart: 7, comment: "c" })
    ).json()) as Item;
    const res = await send("POST", "/api/items/reorder", { ids: [second.id, item.id] });
    expect(res.status).toBe(200);
    const ordered = (await res.json()) as Item[];
    expect(ordered.map((i) => i.id)).toEqual([second.id, item.id]);
    expect(ordered.map((i) => i.priority)).toEqual([0, 1]);
    expect((await send("POST", "/api/items/reorder", { ids: "x" })).status).toBe(400);
    await send("DELETE", `/api/items/${second.id}`);
  });

  test("delete then 404", async () => {
    expect((await send("DELETE", `/api/items/${item.id}`)).status).toBe(204);
    expect((await send("PATCH", `/api/items/${item.id}`, { comment: "z" })).status).toBe(404);
  });
});

describe("security", () => {
  test("bad Host is rejected", async () => {
    const response = await rawRequest("evil.example");
    expect(response).toStartWith("HTTP/1.1 403");
  });

  test("good Host is accepted", async () => {
    const port = new URL(base).port;
    expect(await rawRequest(`localhost:${port}`)).toStartWith("HTTP/1.1 200");
  });

  test("foreign Origin on POST is rejected", async () => {
    const res = await send(
      "POST",
      "/api/items",
      { kind: "frame", frameStart: 1, comment: "x" },
      { Origin: "http://evil.example" },
    );
    expect(res.status).toBe(403);
    const items = (await (await send("GET", "/api/items")).json()) as Item[];
    expect(items).toEqual([]);
  });

  test("Vite origin is rejected without dev", async () => {
    const res = await send(
      "POST",
      "/api/items/reorder",
      { ids: [] },
      { Origin: "http://localhost:5173" },
    );
    expect(res.status).toBe(403);
  });

  test("frames path traversal", async () => {
    for (const path of [
      "/api/frames/..%2F..%2Fx/a.png",
      "/api/frames/a.b/a.png",
      "/api/frames/abc/..%2F..%2Fqueue.png",
      "/api/frames/abc/a..png",
    ]) {
      const res = await send("GET", path);
      expect([400, 404]).toContain(res.status);
      expect(res.headers.get("content-type")).not.toBe("image/png");
    }
  });
});

test("unknown api route is 404 JSON", async () => {
  const res = await send("GET", "/api/nope");
  expect(res.status).toBe(404);
  expect(((await res.json()) as { error: string }).error).toBeString();
});

interface SseReader {
  next(name: string, timeoutMs: number): Promise<unknown>;
  close(): void;
}

async function openEvents(url: string): Promise<{ res: Response; reader: SseReader }> {
  const controller = new AbortController();
  const res = await fetch(`${url}/api/events`, { signal: controller.signal });
  const body = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const reader: SseReader = {
    async next(name, timeoutMs) {
      const end = Date.now() + timeoutMs;
      for (;;) {
        let cut = buffer.indexOf("\n\n");
        while (cut >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (event === name && data) return JSON.parse(data);
          cut = buffer.indexOf("\n\n");
        }
        const left = end - Date.now();
        if (left <= 0) throw new Error(`No ${name} event within ${timeoutMs} ms`);
        const chunk = await Promise.race([
          body.read(),
          new Promise<null>((r) => setTimeout(() => r(null), left)),
        ]);
        if (chunk === null) throw new Error(`No ${name} event within ${timeoutMs} ms`);
        if (chunk.done) throw new Error("Event stream ended");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
    close() {
      controller.abort();
    },
  };
  return { res, reader };
}

describe("re-render loop", () => {
  let dir: string;
  let clip: string;
  let live: RunningServer;
  let api: string;
  let fixedA: Item;
  let fixedLate: Item;
  let todo: Item;

  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${api}${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "framecue-rr-"));
    clip = join(dir, "clip.mp4");
    await renderClip(clip);
    live = await startServer({ videoPath: clip, workspaceDir: join(dir, "ws"), port: 0 });
    api = live.url;
    const make = async (frameStart: number) =>
      (await (
        await call("POST", "/api/items", { kind: "frame", frameStart, comment: "" })
      ).json()) as Item;
    fixedA = await make(5);
    fixedLate = await make(40);
    todo = await make(8);
    for (const it of [fixedA, fixedLate])
      await call("PATCH", `/api/items/${it.id}`, { status: "fixed" });
  }, 30_000);

  afterAll(async () => {
    live.stop();
    await rm(dir, { recursive: true, force: true });
  });

  test("event stream headers", async () => {
    const { res, reader } = await openEvents(api);
    expect(res.headers.get("content-type")).toStartWith("text/event-stream");
    reader.close();
  });

  test("events reject a foreign Host", async () => {
    const res = await fetch(`${api}/api/events`, { headers: { Origin: "http://evil.example" } });
    expect(res.status).toBe(403);
  });

  test("a render captures after images for fixed items only", async () => {
    const { reader } = await openEvents(api);
    try {
      await renderByRename(clip, { box: [4, 10], seconds: 1 });
      const event = (await reader.next("render", 20_000)) as RenderEvent;
      expect(event.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(event.info.frameCount).toBe(25);
      expect(event.capturedIds).toEqual([fixedA.id]);
      expect(event.skipped.map((s) => s.id)).toEqual([fixedLate.id]);
      expect(event.skipped[0]?.reason).toBeString();
      expect(event.timingChanged).toEqual({
        from: { fps: 25, frameCount: 50 },
        to: { fps: 25, frameCount: 25 },
      });
      await reader.next("items", 5000);

      const items = (await (await call("GET", "/api/items")).json()) as Item[];
      const byId = new Map(items.map((i) => [i.id, i]));
      expect(byId.get(fixedA.id)?.after?.sha256).toBe(event.sha256);
      expect(byId.get(fixedA.id)?.after?.images[0]).toBe(
        `frames/${fixedA.id}/after-${event.sha256.slice(0, 8)}/frame.png`,
      );
      expect(byId.get(fixedLate.id)?.after ?? null).toBeNull();
      expect(byId.get(todo.id)?.after ?? null).toBeNull();

      const info = (await (await call("GET", "/api/video")).json()) as {
        sha256: string;
        frameCount: number;
      };
      expect(info.sha256).toBe(event.sha256);
      expect(info.frameCount).toBe(25);

      const image = await call(
        "GET",
        `/api/frames/${fixedA.id}/after-${event.sha256.slice(0, 8)}/frame.png`,
      );
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");

      const stream = await call("GET", `/api/video/stream?v=${event.sha256.slice(0, 8)}`);
      expect(stream.status).toBe(200);
      expect((await stream.arrayBuffer()).byteLength).toBe(Bun.file(clip).size);
    } finally {
      reader.close();
    }
  }, 40_000);

  test("POST /after captures on demand for any status", async () => {
    const res = await call("POST", `/api/items/${todo.id}/after`);
    expect(res.status).toBe(200);
    const item = (await res.json()) as Item;
    expect(item.status).toBe("todo");
    expect(item.after?.images[0]).toMatch(
      new RegExp(`^frames/${todo.id}/after-[0-9a-f]{8}/frame.png$`),
    );
  });

  test("POST /after out of range is 409, unknown id is 404", async () => {
    const late = await call("POST", `/api/items/${fixedLate.id}/after`);
    expect(late.status).toBe(409);
    expect(((await late.json()) as { error: string }).error).toBeString();
    expect((await call("POST", "/api/items/nope/after")).status).toBe(404);
  });
  test("a render that no longer covers an item clears its stale after", async () => {
    const created = (await (
      await call("POST", "/api/items", { kind: "frame", frameStart: 20, comment: "" })
    ).json()) as Item;
    await call("PATCH", `/api/items/${created.id}`, { status: "fixed" });
    const captured = (await (await call("POST", `/api/items/${created.id}/after`)).json()) as Item;
    const folder = join(
      dir,
      "ws",
      "frames",
      created.id,
      captured.after?.images[0]?.split("/")[2] ?? "x",
    );
    expect(await Bun.file(join(folder, "frame.png")).exists()).toBe(true);
    const { reader } = await openEvents(api);
    try {
      await renderByRename(clip, { box: [2, 6], seconds: 0.4 });
      const event = (await reader.next("render", 20_000)) as RenderEvent;
      expect(event.skipped.map((s) => s.id)).toContain(created.id);
      expect(event.capturedIds).not.toContain(created.id);
      const items = (await (await call("GET", "/api/items")).json()) as Item[];
      expect(items.find((i) => i.id === created.id)?.after ?? null).toBeNull();
      expect(await Bun.file(join(folder, "frame.png")).exists()).toBe(false);
    } finally {
      reader.close();
    }
  }, 40_000);
});
