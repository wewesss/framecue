import type { PeaksResponse } from "../api";
import { RULER_H } from "./layout";
import { resamplePeaks } from "./peaks";
import { rulerSteps, rulerTicks, SHADE_MIN_PPF, TICK_HEIGHT } from "./ticks";
import type { View } from "./zoom";

interface Colors {
  muted: string;
  faint: string;
  text: string;
  hover: string;
  border: string;
  wave: string;
  waveRms: string;
  mono: string;
}

function colors(): Colors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    muted: read("--text-muted"),
    faint: read("--text-faint"),
    text: read("--text"),
    hover: read("--fc-fill-4"),
    border: read("--border"),
    wave: read("--wave"),
    waveRms: read("--wave-rms"),
    mono: read("--mono") || "monospace",
  };
}

function setup(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

export interface GridOptions {
  width: number;
  height: number;
  view: View;
  fps: number;
  theme: string;
}

export function drawGrid(canvas: HTMLCanvasElement, options: GridOptions) {
  const { width, height, view, fps } = options;
  const target = setup(canvas, width, height);
  if (!target) return;
  const { ctx } = target;
  const c = colors();
  const span = view.v1 - view.v0;
  const ppf = width / span;

  if (ppf >= SHADE_MIN_PPF) {
    ctx.fillStyle = c.hover;
    for (let f = Math.floor(view.v0); f < view.v1; f++) {
      if (f % 2 !== 0) continue;
      ctx.fillRect(((f - view.v0) / span) * width, RULER_H, ppf, height - RULER_H);
    }
  }

  const steps = rulerSteps(ppf, fps);
  const ticks = rulerTicks(view.v0, view.v1, width, steps, fps);
  ctx.textBaseline = "top";
  for (const tick of ticks) {
    const h = TICK_HEIGHT[tick.level];
    ctx.fillStyle = tick.level === "major" ? c.muted : c.faint;
    ctx.fillRect(Math.round(tick.x), RULER_H - h, 1, h);
    if (tick.text) {
      ctx.font = `${tick.second ? 600 : 400} 10.5px ${c.mono}`;
      ctx.fillStyle = tick.second ? c.text : c.muted;
      ctx.fillText(tick.text, Math.round(tick.x) + 4, 3);
    }
  }
}

export interface WaveOptions {
  width: number;
  height: number;
  view: View;
  fps: number;
  theme: string;
  peaks: PeaksResponse;
}

export function drawWave(canvas: HTMLCanvasElement, options: WaveOptions) {
  const { width, height, view, fps, peaks } = options;
  const target = setup(canvas, width, height);
  if (!target) return;
  const { ctx, w, h } = target;
  const c = colors();
  const mid = h / 2;
  const amp = h / 2 - 2;
  ctx.fillStyle = c.border;
  ctx.fillRect(0, Math.round(mid), w, 1);
  const slice = resamplePeaks(peaks.data, peaks.rate, fps, view.v0, view.v1, w);
  if (slice.mode === "line") {
    ctx.strokeStyle = c.waveRms;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let i = 0; i < slice.x.length; i++) {
      const x = slice.x[i] ?? 0;
      const y = mid - (slice.y[i] ?? 0) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }
  for (let x = 0; x < w; x++) {
    const max = slice.max[x] ?? 0;
    const min = slice.min[x] ?? 0;
    if (max === 0 && min === 0) continue;
    ctx.fillStyle = c.wave;
    ctx.fillRect(x, mid - max * amp, 1, Math.max(1, (max - min) * amp));
    const body = slice.body[x] ?? 0;
    ctx.fillStyle = c.waveRms;
    ctx.fillRect(x, mid - body * amp, 1, Math.max(1, body * 2 * amp));
  }
}
