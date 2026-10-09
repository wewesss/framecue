import { type ChildProcess, spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const INSTALL_HINT: Record<string, string> = {
  win32: "winget install Gyan.FFmpeg",
  darwin: "brew install ffmpeg",
};

export function missingToolError(tool: string, error: Error): Error {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "ENOENT") return new Error(`Cannot run ${tool}: ${error.message}`);
  const install = INSTALL_HINT[process.platform] ?? "sudo apt install ffmpeg";
  return new Error(
    `Cannot run ${tool}: is it installed and on PATH? Install ffmpeg (which includes ffprobe), for example: ${install}`,
  );
}

export function spawnPiped(cmd: string[]): { child: ChildProcess; failed: Promise<never> } {
  const [file, ...args] = cmd as [string, ...string[]];
  const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const failed = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(missingToolError(file, error)));
  });
  failed.catch(() => undefined);
  return { child, failed };
}

function collect(stream: NodeJS.ReadableStream | null): Promise<string> {
  return new Promise((done) => {
    if (!stream) return done("");
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.once("end", () => done(Buffer.concat(chunks).toString("utf8")));
    stream.once("error", () => done(Buffer.concat(chunks).toString("utf8")));
    stream.once("close", () => done(Buffer.concat(chunks).toString("utf8")));
  });
}

export function exitCodeOf(child: ChildProcess): Promise<number> {
  return new Promise((done) => {
    child.once("close", (code) => done(code ?? 1));
  });
}

export async function run(cmd: string[]): Promise<ExecResult> {
  const { child, failed } = spawnPiped(cmd);
  const finished = Promise.all([collect(child.stdout), collect(child.stderr), exitCodeOf(child)]);
  const [stdout, stderr, exitCode] = await Promise.race([finished, failed]);
  return { stdout, stderr, exitCode };
}

export function tail(text: string, lines = 15): string {
  return text.trim().split(/\r?\n/).slice(-lines).join("\n");
}

export async function runFfmpeg(args: string[]): Promise<void> {
  const res = await run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...args]);
  if (res.exitCode !== 0) {
    throw new Error(`ffmpeg failed (exit ${res.exitCode}):\n${tail(res.stderr)}`);
  }
}
