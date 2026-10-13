import { cp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const outdir = join(root, "plugin", "server");
const webSrc = join(root, "dist", "web");

if (!(await Bun.file(join(webSrc, "index.html")).exists())) {
  console.error("run bun run build:web first");
  process.exit(1);
}

const result = await Bun.build({
  entrypoints: [join(root, "src", "cli.ts")],
  target: "bun",
  format: "esm",
  minify: true,
  outdir,
  naming: "framecue.js",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await rm(join(outdir, "web"), { recursive: true, force: true });
await cp(webSrc, join(outdir, "web"), { recursive: true });
