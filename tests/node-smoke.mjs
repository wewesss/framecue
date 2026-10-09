import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
const runtimeFlag = process.argv.indexOf("--runtime");
const runtimeName = runtimeFlag === -1 ? "node" : (process.argv[runtimeFlag + 1] ?? "node");
const runtime = runtimeName === "node" ? process.execPath : runtimeName;

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function rawGet(port, path, host) {
  return new Promise((resolveStatus, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, headers: { Host: host } }, (res) => {
      res.resume();
      resolveStatus(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForUrl(child) {
  let output = "";
  return await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error(`no URL printed:\n${output}`)), 30_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const m = /URL:\s+(http:\/\/\S+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        resolveUrl(m[1]);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`exited early (${code}):\n${output}`));
    });
  });
}

async function readUntil(reader, needle, ms) {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && !text.includes(needle)) {
    const result = await Promise.race([
      reader.read(),
      sleep(deadline - Date.now()).then(() => null),
    ]);
    if (!result || result.done) break;
    text += decoder.decode(result.value);
  }
  return text;
}

async function main() {
  check("dist/cli.js exists", existsSync(cli));
  check("dist/web/index.html exists", existsSync(join(root, "dist", "web", "index.html")));
  if (failures > 0) return;

  const work = mkdtempSync(join(tmpdir(), "framecue-smoke-"));
  const clip = join(work, "my clip.mp4");
  const gen = spawnSync(
    "ffmpeg",
    [
      ...["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=25"],
      ...["-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-pix_fmt", "yuv420p"],
      ...["-shortest", clip],
    ],
    { encoding: "utf8" },
  );
  check("ffmpeg generates the clip", gen.status === 0, gen.stderr);
  if (gen.status !== 0) return;
  const workspace = join(work, "ws");
  mkdirSync(workspace);

  console.log(`runtime: ${runtimeName} (${runtime})`);
  const help = spawnSync(runtime, [cli, "--help"], { encoding: "utf8" });
  check("--help exits 0", help.status === 0 && help.stdout.includes("Usage: framecue"));

  const server = spawn(runtime, [cli, clip, "--no-open", "--port", "0", "--dir", workspace], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((done) =>
    server.once("exit", (code, signal) => done({ code, signal })),
  );

  try {
    const url = await waitForUrl(server);
    const port = Number(new URL(url).port);
    console.log(`server: ${url}`);

    const health = await fetch(`${url}/api/health`);
    check("GET /api/health", health.status === 200 && (await health.json()).ok === true);

    const info = await (await fetch(`${url}/api/video`)).json();
    check(
      "GET /api/video",
      info.width === 160 && info.frameCount === 50 && info.audio !== null,
      JSON.stringify(info),
    );

    const full = await fetch(`${url}/api/video/stream`);
    const fullBytes = new Uint8Array(await full.arrayBuffer());
    check(
      "GET /api/video/stream full",
      full.status === 200 &&
        full.headers.get("content-type") === "video/mp4" &&
        full.headers.get("accept-ranges") === "bytes" &&
        Number(full.headers.get("content-length")) === fullBytes.length &&
        fullBytes.length > 1000,
    );

    const part = await fetch(`${url}/api/video/stream`, { headers: { Range: "bytes=100-299" } });
    const partBytes = new Uint8Array(await part.arrayBuffer());
    check(
      "Range 100-299 -> 206",
      part.status === 206 &&
        part.headers.get("content-range") === `bytes 100-299/${fullBytes.length}` &&
        partBytes.length === 200 &&
        partBytes.every((b, i) => b === fullBytes[100 + i]),
    );

    const suffix = await fetch(`${url}/api/video/stream`, { headers: { Range: "bytes=-50" } });
    check(
      "Range suffix -50",
      suffix.status === 206 && (await suffix.arrayBuffer()).byteLength === 50,
    );

    const bad = await fetch(`${url}/api/video/stream`, {
      headers: { Range: `bytes=${fullBytes.length + 5}-` },
    });
    await bad.arrayBuffer();
    check("Range beyond end -> 416", bad.status === 416);

    const posted = await fetch(`${url}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "frame", frameStart: 7, comment: "smoke item" }),
    });
    const item = await posted.json();
    check("POST /api/items -> 201", posted.status === 201 && typeof item.id === "string");

    const png = item.images.find((p) => p.endsWith(".png"));
    const frame = await fetch(`${url}/api/frames/${item.id}/${png.split("/").pop()}`);
    const frameBytes = new Uint8Array(await frame.arrayBuffer());
    check(
      "GET frame PNG",
      frame.status === 200 &&
        frame.headers.get("content-type") === "image/png" &&
        frameBytes[0] === 0x89 &&
        frameBytes[1] === 0x50,
    );

    const missing = await fetch(`${url}/api/frames/${item.id}/nope.png`);
    await missing.arrayBuffer();
    check("missing frame -> 404", missing.status === 404);

    const patched = await fetch(`${url}/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "edited" }),
    });
    check("PATCH item", patched.status === 200 && (await patched.json()).comment === "edited");

    const peaks = await fetch(`${url}/api/audio/peaks`);
    const peakBytes = await peaks.arrayBuffer();
    check("GET /api/audio/peaks", peaks.status === 200 && peakBytes.byteLength > 100);

    const exportRes = await fetch(`${url}/api/export?format=jsonl`);
    check(
      "GET /api/export",
      exportRes.status === 200 && (await exportRes.text()).includes(item.id),
    );

    const index = await fetch(`${url}/`);
    const html = await index.text();
    check(
      "GET / serves index.html",
      index.status === 200 && (index.headers.get("content-type") ?? "").startsWith("text/html"),
    );
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    check("index references assets", assets.length >= 2, html);
    for (const asset of assets) {
      const res = await fetch(`${url}${asset}`);
      await res.arrayBuffer();
      const type = res.headers.get("content-type") ?? "";
      const expected = asset.endsWith(".js") ? "javascript" : "css";
      check(`asset ${asset}`, res.status === 200 && type.includes(expected), type);
    }

    check("bad Host -> 403", (await rawGet(port, "/api/health", "evil.test")) === 403);
    const badOrigin = await fetch(`${url}/api/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://evil.test" },
      body: "{}",
    });
    await badOrigin.arrayBuffer();
    check("foreign Origin POST -> 403", badOrigin.status === 403);
    const unknown = await fetch(`${url}/api/nothing`);
    await unknown.arrayBuffer();
    check("unknown /api route -> 404", unknown.status === 404);

    const controller = new AbortController();
    const events = await fetch(`${url}/api/events`, { signal: controller.signal });
    check(
      "GET /api/events is SSE",
      events.status === 200 && events.headers.get("content-type")?.includes("text/event-stream"),
    );
    const reader = events.body.getReader();
    check("SSE greets", (await readUntil(reader, ": connected", 5000)).includes(": connected"));

    const client = new Client({ name: "framecue-smoke", version: "0.0.0" });
    const transport = new StdioClientTransport({
      command: runtime,
      args: [cli, "mcp", workspace],
      stderr: "pipe",
    });
    await client.connect(transport);
    try {
      const listed = await client.callTool({ name: "list_items", arguments: {} });
      check(
        "MCP list_items",
        listed.structuredContent?.items?.some((it) => it.id === item.id) === true,
        JSON.stringify(listed),
      );
      const got = await client.callTool({ name: "get_item", arguments: { id: item.id } });
      check(
        "MCP get_item returns text and image",
        got.content.some((c) => c.type === "text") && got.content.some((c) => c.type === "image"),
      );
      const fixed = await client.callTool({
        name: "mark_fixed",
        arguments: { id: item.id, note: "smoke fix" },
      });
      check(
        "MCP mark_fixed",
        !fixed.isError && fixed.structuredContent?.item?.status === "fixed",
        JSON.stringify(fixed),
      );
    } finally {
      await client.close();
    }

    const pushed = await readUntil(reader, "event: items", 8000);
    check("SSE items event after MCP write", pushed.includes("event: items"));
    controller.abort();
    await reader.cancel().catch(() => undefined);

    const after = await (await fetch(`${url}/api/items?status=fixed`)).json();
    check("queue shows fixed item", after.length === 1 && after[0].agentNote === "smoke fix");
  } catch (error) {
    failures++;
    console.log(`FAIL unexpected error: ${error instanceof Error ? error.stack : error}`);
    console.log(stderr);
  } finally {
    server.kill("SIGINT");
    const result = await Promise.race([exited, sleep(5000).then(() => null)]);
    if (!result) {
      server.kill("SIGKILL");
      check("server stops on SIGINT", false);
    } else {
      check("server stops on SIGINT", true);
    }
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  failures++;
  console.log(`FAIL ${error instanceof Error ? error.stack : error}`);
}

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
process.exit(0);
