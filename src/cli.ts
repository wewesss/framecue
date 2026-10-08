#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startServer } from "./server/server";

const [first] = process.argv.slice(2);

if (!first) {
  console.error("Usage: framecue <video>\n       framecue mcp");
  process.exit(1);
}

if (first === "mcp") {
  console.log("mcp: not implemented yet");
  process.exit(0);
}

const videoPath = resolve(first);

if (!existsSync(videoPath)) {
  console.error(`File not found: ${videoPath}`);
  process.exit(1);
}

const server = startServer({ videoPath });
console.log(`framecue running at http://127.0.0.1:${server.port}`);
