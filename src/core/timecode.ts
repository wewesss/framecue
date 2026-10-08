export function frameToTimecode(frame: number, fps: number): string {
  const base = Math.round(fps);
  const ff = frame % base;
  const totalSeconds = Math.floor(frame / base);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`;
}

export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

export function secondsToFrame(sec: number, fps: number): number {
  return Math.floor(sec * fps + 1e-6);
}

export function formatClock(sec: number): string {
  const totalMs = Math.round(sec * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
