export type WaveSlice =
  | { mode: "columns"; min: Float32Array; max: Float32Array; body: Float32Array }
  | { mode: "line"; x: Float32Array; y: Float32Array };

const LINE_BELOW = 1.5;
const RMS_FROM_PEAK = 0.7;

export function bucketsPerPixel(
  rate: number,
  fps: number,
  v0: number,
  v1: number,
  width: number,
): number {
  return (((v1 - v0) / fps) * rate) / Math.max(1, width);
}

export function resamplePeaks(
  data: Int8Array,
  rate: number,
  fps: number,
  v0: number,
  v1: number,
  width: number,
): WaveSlice {
  const buckets = Math.floor(data.length / 2);
  const bpp = bucketsPerPixel(rate, fps, v0, v1, width);
  const first = (v0 / fps) * rate;
  const norm = (value: number | undefined) => (value ?? 0) / 127;

  if (bpp < LINE_BELOW) {
    const start = Math.max(0, Math.floor(first));
    const end = Math.min(buckets - 1, Math.ceil(first + width * bpp));
    const count = Math.max(0, end - start + 1);
    const x = new Float32Array(count * 2);
    const y = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const px = (start + i + 0.5 - first) / bpp;
      x[i * 2] = px;
      y[i * 2] = norm(data[(start + i) * 2 + 1]);
      x[i * 2 + 1] = px;
      y[i * 2 + 1] = norm(data[(start + i) * 2]);
    }
    return { mode: "line", x, y };
  }

  const min = new Float32Array(width);
  const max = new Float32Array(width);
  const body = new Float32Array(width);
  for (let col = 0; col < width; col++) {
    const from = Math.floor(first + col * bpp);
    if (from < 0 || from >= buckets) continue;
    const to = Math.min(buckets, Math.max(from + 1, Math.floor(first + (col + 1) * bpp)));
    let lo = 1;
    let hi = -1;
    let energy = 0;
    for (let i = from; i < to; i++) {
      const a = norm(data[i * 2]);
      const b = norm(data[i * 2 + 1]);
      if (a < lo) lo = a;
      if (b > hi) hi = b;
      energy += (a * a + b * b) / 2;
    }
    min[col] = lo;
    max[col] = hi;
    body[col] = Math.sqrt(energy / (to - from)) * RMS_FROM_PEAK;
  }
  return { mode: "columns", min, max, body };
}
