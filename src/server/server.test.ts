import { expect, test } from "bun:test";
import { startServer } from "./server";

test("health endpoint reports ok", async () => {
  const server = startServer({ port: 0, videoPath: "demo.mp4" });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    expect(await response.json()).toEqual({ ok: true, video: "demo.mp4" });
  } finally {
    server.stop(true);
  }
});
