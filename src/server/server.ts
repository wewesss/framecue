import { join, normalize, resolve } from "node:path";

const webRoot = resolve(import.meta.dir, "../../dist/web");

type StartServerOptions = {
  port?: number;
  videoPath: string;
};

export function startServer({ port = 5730, videoPath }: StartServerOptions) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/health") {
        return Response.json({ ok: true, video: videoPath });
      }

      const relative = normalize(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      const target = join(webRoot, relative);

      if (target.startsWith(webRoot)) {
        const file = Bun.file(target);
        if (await file.exists()) {
          return new Response(file);
        }
      }

      const index = Bun.file(join(webRoot, "index.html"));
      if (await index.exists()) {
        return new Response(index);
      }

      return new Response("Not found", { status: 404 });
    },
  });
}
