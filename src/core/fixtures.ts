import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpeg } from "./exec";

export interface Fixtures {
  dir: string;
  cfr: string;
  vfr: string;
  cleanup: () => Promise<void>;
}

const BASE = ["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=25", "-t", "2"];
const ENC = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "10"];

export async function makeFixtures(): Promise<Fixtures> {
  const dir = join(tmpdir(), `framecue-test-${Math.random().toString(36).slice(2, 10)}`);
  await mkdir(dir, { recursive: true });
  const cfr = join(dir, "cfr.mp4");
  const vfr = join(dir, "vfr.mp4");
  await runFfmpeg([...BASE, ...ENC, cfr]);
  await runFfmpeg([
    ...BASE,
    "-vf",
    "setpts=(N+floor(N/10))/FRAME_RATE/TB",
    "-fps_mode",
    "vfr",
    ...ENC,
    vfr,
  ]);
  return { dir, cfr, vfr, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
