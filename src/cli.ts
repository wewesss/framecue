#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startServer } from "./server/server";

const USAGE = `Usage: framecue <video> [--dir <folder>] [--port <n>] [--no-open] [--dev]
       framecue mcp [<video|folder>] [--dir <workspace>]

Options:
  --dir <folder>  Workspace folder (default: .framecue next to the video)
  --port <n>      Port to listen on (default: 5730)
  --no-open       Do not open the browser
  --dev           Allow the Vite dev origin (http://localhost:5173)
  -h, --help      Show this help

mcp serves the review queue to an agent over stdio (stdout is the protocol).
The workspace is found from a video file, a .framecue folder, a folder containing
.framecue, or by searching upward from the current folder.`;

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
    const [file, ...args] = argv as [string, ...string[]];
    const child = spawn(file, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.on("error", () => undefined);
    child.unref();
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

if (first === "mcp") {
  if (extra.length > 1) usage(1);
  try {
    const { resolveMcpWorkspace } = await import("./mcp/workspace");
    const { runMcp } = await import("./mcp/server");
    await runMcp(resolveMcpWorkspace({ path: extra[0], dir: values.dir, cwd: process.cwd() }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
} else {
  if (!first || extra.length > 0) usage(1);
  await serve(first);
}

async function serve(video: string) {
  const videoPath = resolve(video);

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
      onRender: (event) => {
        const n = event.capturedIds.length;
        console.log(
          `Render:     new render detected (${event.sha256.slice(0, 8)}), ${n} fixed item(s) to verify`,
        );
        for (const skip of event.skipped) console.error(`Skipped ${skip.id}: ${skip.reason}`);
        if (event.timingChanged) {
          const { from, to } = event.timingChanged;
          console.error(
            `Timing changed: ${from.fps} fps / ${from.frameCount} frames -> ${to.fps} fps / ${to.frameCount} frames; frame numbers may no longer line up.`,
          );
        }
      },
      onRenderError: (error) => {
        console.error(
          `Render check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
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
}
