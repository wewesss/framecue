import { extname, join, normalize, resolve } from "node:path";
import { matcher, P } from "matchigo";
import {
  computePeaks,
  createItem,
  deleteItem,
  type Item,
  type ItemKind,
  type ItemPatch,
  type ItemStatus,
  type Peaks,
  probeVideo,
  type Region,
  readQueue,
  reorder,
  resolveWorkspace,
  sha256File,
  updateItem,
  type VideoInfo,
} from "../core";

const webRoot = resolve(import.meta.dir, "../../dist/web");

const DEFAULT_PORT = 5730;
const PORT_ATTEMPTS = 10;
const VITE_PORT = 5173;

const KINDS: ItemKind[] = ["frame", "range", "region"];
const STATUSES: ItemStatus[] = ["todo", "fixed", "verified", "reopened"];

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

const BAD_REQUEST_PREFIXES = [
  "Frames must",
  "frameStart must",
  "A region item",
  "Region ",
  "Invalid JSON",
  "Invalid ",
];

export interface StartServerOptions {
  videoPath: string;
  workspaceDir?: string;
  port?: number;
  dev?: boolean;
}

export interface RunningServer {
  server: Bun.Server<undefined>;
  url: string;
  info: VideoInfo;
  workspace: string;
  stop(): void;
}

interface Ctx {
  peaks: () => Promise<Peaks | null>;
  method: string;
  parts: string[];
  request: Request;
  url: URL;
  info: VideoInfo;
  sha256: string;
  workspace: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Item not found")) return json({ error: message }, 404);
  if (message.startsWith("Invalid status transition")) return json({ error: message }, 409);
  if (BAD_REQUEST_PREFIXES.some((p) => message.startsWith(p))) {
    return json({ error: message }, 400);
  }
  return json({ error: message }, 500);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    fail(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    fail(400, "Body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

function parseStatus(value: string | null | undefined): ItemStatus | undefined {
  if (value === null || value === undefined) return undefined;
  if (!STATUSES.includes(value as ItemStatus)) fail(400, `Invalid status: ${value}`);
  return value as ItemStatus;
}

function parseRegion(value: unknown): Region | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "object" || Array.isArray(value)) fail(400, "Invalid region");
  return value as Region;
}

function parsePatch(body: Record<string, unknown>): ItemPatch {
  const patch: ItemPatch = {};
  if (body.comment !== undefined) {
    if (typeof body.comment !== "string") fail(400, "Invalid comment");
    patch.comment = body.comment;
  }
  if (body.priority !== undefined) {
    if (typeof body.priority !== "number" || !Number.isFinite(body.priority)) {
      fail(400, "Invalid priority");
    }
    patch.priority = body.priority;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string") fail(400, "Invalid status");
    patch.status = parseStatus(body.status);
  }
  if (body.agentNote !== undefined) {
    if (body.agentNote !== null && typeof body.agentNote !== "string") {
      fail(400, "Invalid agentNote");
    }
    patch.agentNote = body.agentNote;
  }
  if (body.region !== undefined) patch.region = parseRegion(body.region);
  return patch;
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return null;
  return { start, end };
}

function videoInfo(c: Ctx): Response {
  return json({ ...c.info, sha256: c.sha256, workspace: c.workspace });
}

function streamVideo({ request, info }: Ctx): Response {
  const file = Bun.file(info.path);
  const size = file.size;
  const type = MIME[extname(info.path).toLowerCase()] ?? "application/octet-stream";
  const base = { "Content-Type": type, "Accept-Ranges": "bytes" };
  const rangeHeader = request.headers.get("range");
  if (rangeHeader === null) {
    return new Response(file, { headers: { ...base, "Content-Length": String(size) } });
  }
  const range = parseRange(rangeHeader, size);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${size}` },
    });
  }
  return new Response(file.slice(range.start, range.end + 1), {
    status: 206,
    headers: {
      ...base,
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Content-Length": String(range.end - range.start + 1),
    },
  });
}

async function serveAudioPeaks({ peaks }: Ctx): Promise<Response> {
  const result = await peaks();
  if (!result) fail(404, "No audio track");
  return new Response(result.data.slice().buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Peaks-Rate": String(result.rate),
      "X-Peaks-Length": String(result.length),
      "Cache-Control": "no-store",
    },
  });
}

async function listItems({ url, workspace }: Ctx): Promise<Response> {
  const status = parseStatus(url.searchParams.get("status"));
  const items = await readQueue(workspace);
  return json(status ? items.filter((it) => it.status === status) : items);
}

async function postItem({ request, info, sha256, workspace }: Ctx): Promise<Response> {
  const body = await readBody(request);
  if (typeof body.kind !== "string" || !KINDS.includes(body.kind as ItemKind)) {
    fail(400, "Invalid kind");
  }
  if (typeof body.frameStart !== "number") fail(400, "Invalid frameStart");
  if (body.frameEnd !== undefined && typeof body.frameEnd !== "number") {
    fail(400, "Invalid frameEnd");
  }
  if (typeof body.comment !== "string") fail(400, "Invalid comment");
  const item: Item = await createItem(workspace, {
    video: info,
    sha256,
    kind: body.kind as ItemKind,
    frameStart: body.frameStart,
    frameEnd: body.frameEnd as number | undefined,
    region: parseRegion(body.region),
    comment: body.comment,
  });
  return json(item, 201);
}

async function patchItem({ request, parts, workspace }: Ctx): Promise<Response> {
  const patch = parsePatch(await readBody(request));
  return json(await updateItem(workspace, parts[2] as string, patch, { actor: "user" }));
}

async function removeItem({ parts, workspace }: Ctx): Promise<Response> {
  await deleteItem(workspace, parts[2] as string);
  return new Response(null, { status: 204 });
}

async function reorderItems({ request, workspace }: Ctx): Promise<Response> {
  const body = await readBody(request);
  if (!Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string")) {
    fail(400, "ids must be an array of strings");
  }
  return json(await reorder(workspace, body.ids as string[]));
}

async function serveFrame({ parts, workspace }: Ctx): Promise<Response> {
  const [, , id, name] = parts as [string, string, string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[A-Za-z0-9_.-]+\.png$/.test(name) || name.includes("..")) {
    fail(400, "Invalid frame path");
  }
  const file = Bun.file(join(workspace, "frames", id, name));
  if (!(await file.exists())) fail(404, "Frame not found");
  return new Response(file, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}

const dispatch = matcher<Ctx, Response | Promise<Response>>()
  .with({ method: "GET", parts: P.tuple("api", "health") }, () => json({ ok: true }))
  .with({ method: "GET", parts: P.tuple("api", "video") }, videoInfo)
  .with({ method: "GET", parts: P.tuple("api", "video", "stream") }, streamVideo)
  .with({ method: "GET", parts: P.tuple("api", "audio", "peaks") }, serveAudioPeaks)
  .with({ method: "GET", parts: P.tuple("api", "items") }, listItems)
  .with({ method: "POST", parts: P.tuple("api", "items") }, postItem)
  .with({ method: "POST", parts: P.tuple("api", "items", "reorder") }, reorderItems)
  .with({ method: "PATCH", parts: P.tuple("api", "items", P.string) }, patchItem)
  .with({ method: "DELETE", parts: P.tuple("api", "items", P.string) }, removeItem)
  .with({ method: "GET", parts: P.tuple("api", "frames", P.string, P.string) }, serveFrame)
  .with({ parts: P.when((p) => Array.isArray(p) && p[0] === "api") }, () => fail(404, "Not found"))
  .otherwise(serveStatic);

async function serveStatic({ method, url }: Ctx): Promise<Response> {
  if (method !== "GET" && method !== "HEAD") return new Response("Not found", { status: 404 });
  const relative = normalize(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  const target = join(webRoot, relative);

  if (target.startsWith(webRoot)) {
    const file = Bun.file(target);
    if (await file.exists()) return new Response(file);
  }

  const index = Bun.file(join(webRoot, "index.html"));
  if (await index.exists()) return new Response(index);

  return new Response("Web UI not built: run `bun run build`", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function decodeParts(pathname: string): string[] | null {
  try {
    return pathname
      .split("/")
      .filter((s) => s !== "")
      .map(decodeURIComponent);
  } catch {
    return null;
  }
}

function listen(
  port: number,
  fetch: (request: Request) => Promise<Response>,
): Bun.Server<undefined> {
  const attempts = port === 0 ? 1 : PORT_ATTEMPTS + 1;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return Bun.serve({ hostname: "127.0.0.1", port: port + i, fetch });
    } catch (error) {
      last = error;
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error(
    `No free port between ${port} and ${port + PORT_ATTEMPTS}: ${last instanceof Error ? last.message : String(last)}`,
  );
}

export async function startServer({
  videoPath,
  workspaceDir,
  port = DEFAULT_PORT,
  dev = false,
}: StartServerOptions): Promise<RunningServer> {
  const info = await probeVideo(videoPath);
  const { root: workspace } = await resolveWorkspace(videoPath, workspaceDir);
  const sha256 = await sha256File(videoPath);

  let peaksInFlight: Promise<Peaks | null> | null = null;
  const peaks = () => {
    if (info.audio === null) return Promise.resolve(null);
    peaksInFlight ??= computePeaks(info.path, { workspace, sha256 }).finally(() => {
      peaksInFlight = null;
    });
    return peaksInFlight;
  };

  let boundPort = 0;

  const hostAllowed = (host: string | null) =>
    host === `127.0.0.1:${boundPort}` || host === `localhost:${boundPort}`;

  const originAllowed = (origin: string | null) => {
    if (origin === null) return true;
    const allowed = [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`];
    if (dev) allowed.push(`http://127.0.0.1:${VITE_PORT}`, `http://localhost:${VITE_PORT}`);
    return allowed.includes(origin);
  };

  const server = listen(port, async (request) => {
    if (!hostAllowed(request.headers.get("host"))) return json({ error: "Forbidden host" }, 403);
    const method = request.method;
    if (method !== "GET" && method !== "HEAD" && !originAllowed(request.headers.get("origin"))) {
      return json({ error: "Forbidden origin" }, 403);
    }
    const url = new URL(request.url);
    const parts = decodeParts(url.pathname);
    if (!parts) return json({ error: "Invalid path" }, 400);
    const ctx: Ctx = { peaks, method, parts, request, url, info, sha256, workspace };
    try {
      return await dispatch(ctx);
    } catch (error) {
      return errorResponse(error);
    }
  });
  boundPort = server.port as number;

  return {
    server,
    url: `http://127.0.0.1:${boundPort}`,
    info,
    workspace,
    stop: () => {
      server.stop(true);
    },
  };
}
