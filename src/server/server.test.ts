import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Fixtures, makeFixtures } from "../core/fixtures";
import type { Item } from "../core/types";
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
