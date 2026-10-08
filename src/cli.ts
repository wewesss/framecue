#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startServer } from "./server/server";

const USAGE = `Usage: framecue <video> [--dir <folder>] [--port <n>] [--no-open] [--dev]
       framecue mcp

Options:
  --dir <folder>  Workspace folder (default: .framecue next to the video)
  --port <n>      Port to listen on (default: 5730)
  --no-open       Do not open the browser
  --dev           Allow the Vite dev origin (http://localhost:5173)
  -h, --help      Show this help`;

function usage(code: number): never {
  (code === 0 ? console.log : console.error)(USAGE);
  process.exit(code);
}

function openBrowser(url: string): void {
  const argv =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
  } catch {}
}

function parse() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      options: {
        dir: { type: "string" },
        port: { type: "string" },
        "no-open": { type: "boolean" },
        dev: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
  } catch {
    return usage(1);
  }
}

const { values, positionals } = parse();

if (values.help) usage(0);

const [first, ...extra] = positionals;

if (!first || extra.length > 0) usage(1);

if (first === "mcp") {
  console.log("mcp: not implemented yet");
  process.exit(0);
}

const videoPath = resolve(first);

if (!existsSync(videoPath)) {
  console.error(`File not found: ${videoPath}`);
  process.exit(1);
}

let port: number | undefined;
if (values.port !== undefined) {
  port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`Invalid port: ${values.port}`);
    process.exit(1);
  }
}

try {
  const running = await startServer({
    videoPath,
    workspaceDir: values.dir ? resolve(values.dir) : undefined,
    port,
    dev: values.dev ?? false,
  });
  const { info } = running;

  console.log(`Video:      ${basename(info.path)}`);
  console.log(`Resolution: ${info.width}x${info.height}`);
  console.log(`FPS:        ${info.fps}`);
  console.log(`Frames:     ${info.frameCount}`);
  console.log(`Workspace:  ${running.workspace}`);
  console.log(`URL:        ${running.url}`);
  if (info.vfr) {
    console.error(
      "Variable frame rate detected: frame numbers may be off; consider re-encoding to constant frame rate.",
    );
  }

  if (!values["no-open"]) openBrowser(running.url);

  process.on("SIGINT", () => {
    running.stop();
    process.exit(0);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
