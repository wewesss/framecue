import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline, Readable } from "node:stream";

const BASE = "http://127.0.0.1";

export type Handler = (request: Request) => Promise<Response>;

export function fileBody(path: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const stream = createReadStream(path, start === undefined ? {} : { start, end });
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function toHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else headers.set(name, value);
  }
  return headers;
}

async function toRequest(req: IncomingMessage, res: ServerResponse): Promise<Request | null> {
  const target = req.url ?? "/";
  if (!target.startsWith("/")) return null;
  const method = req.method ?? "GET";
  const controller = new AbortController();
  res.once("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);
  return new Request(BASE + target, {
    method,
    headers: toHeaders(req),
    body: body && body.length > 0 ? new Uint8Array(body) : undefined,
    signal: controller.signal,
  });
}

function writeHead(res: ServerResponse, response: Response): void {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  res.writeHead(response.status, headers);
}

async function send(req: IncomingMessage, res: ServerResponse, response: Response): Promise<void> {
  const streaming =
    response.body !== null &&
    (response.headers.has("content-length") ||
      (response.headers.get("content-type") ?? "").startsWith("text/event-stream"));
  if (response.body === null || req.method === "HEAD") {
    writeHead(res, response);
    res.end();
    void response.body?.cancel().catch(() => undefined);
    return;
  }
  if (!streaming) {
    const bytes = Buffer.from(await response.arrayBuffer());
    response.headers.set("content-length", String(bytes.length));
    writeHead(res, response);
    res.end(bytes);
    return;
  }
  writeHead(res, response);
  res.flushHeaders();
  pipeline(Readable.fromWeb(response.body as never), res, () => undefined);
}

export function createHttpServer(handler: Handler): Server {
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const request = await toRequest(req, res);
        if (!request) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Bad request");
          return;
        }
        await send(req, res, await handler(request));
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(error instanceof Error ? error.message : String(error));
        } else {
          res.destroy();
        }
      }
    })();
  });
  server.on("connection", (socket) => socket.setNoDelay(true));
  return server;
}

export function listenOnce(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve((server.address() as AddressInfo).port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}
