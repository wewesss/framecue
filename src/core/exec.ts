export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function run(cmd: string[]): Promise<ExecResult> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  } catch (error) {
    throw new Error(`Cannot run ${cmd[0]}: is it installed and on PATH? (${String(error)})`);
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
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
