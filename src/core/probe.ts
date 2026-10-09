import { run, tail } from "./exec";
import type { VideoInfo } from "./types";

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  nb_frames?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
}

function parseFraction(value: string | undefined): number {
  if (!value) return 0;
  const [n, d] = value.split("/").map(Number);
  if (!n || Number.isNaN(n)) return 0;
  if (d === undefined) return n;
  if (!d || Number.isNaN(d)) return 0;
  return n / d;
}

async function ffprobe(args: string[]): Promise<string> {
  const res = await run(["ffprobe", "-v", "error", ...args]);
  if (res.exitCode !== 0) {
    throw new Error(`ffprobe failed (exit ${res.exitCode}):\n${tail(res.stderr)}`);
  }
  return res.stdout;
}

const REORDER_TAIL = 16;

async function packetsLookIrregular(path: string): Promise<boolean> {
  const out = await ffprobe([
    "-select_streams",
    "v:0",
    "-read_intervals",
    "%+#300",
    "-show_entries",
    "packet=pts_time",
    "-of",
    "csv=p=0",
    path,
  ]);
  const times = out
    .split(/\r?\n/)
    .map((l) => Number.parseFloat(l.split(",")[0] ?? ""))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    // Reading stops mid-GOP in decode order, so the last reordered (B-frame) timestamps are missing.
    .slice(0, -REORDER_TAIL);
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    deltas.push((times[i] as number) - (times[i - 1] as number));
  }
  if (deltas.length < 2) return false;
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  if (median <= 0) return false;
  return deltas.some((d) => Math.abs(d - median) / median > 0.01);
}

export async function probeVideo(path: string): Promise<VideoInfo> {
  const raw = await ffprobe(["-show_streams", "-show_format", "-of", "json", path]);
  const data = JSON.parse(raw) as { streams?: ProbeStream[]; format?: { duration?: string } };
  const stream = data.streams?.find((s) => s.codec_type === "video");
  if (!stream) throw new Error(`No video stream found in ${path}`);
  const audioStream = data.streams?.find((s) => s.codec_type === "audio");

  const avg = parseFraction(stream.avg_frame_rate);
  const rate = parseFraction(stream.r_frame_rate);
  const fps = avg || rate;
  if (!fps) throw new Error(`Cannot determine frame rate of ${path}`);
  const fpsFraction = (avg ? stream.avg_frame_rate : stream.r_frame_rate) ?? `${fps}/1`;

  let frameCount = Number.parseInt(stream.nb_frames ?? "", 10);
  if (!Number.isFinite(frameCount) || frameCount <= 0) {
    const counted = await ffprobe([
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      path,
    ]);
    frameCount = Number.parseInt(counted.trim().split(/\r?\n/)[0] ?? "", 10);
    if (!Number.isFinite(frameCount) || frameCount <= 0) {
      throw new Error(`Cannot determine frame count of ${path}`);
    }
  }

  const durationSec = Number.parseFloat(stream.duration ?? data.format?.duration ?? "");
  let vfr = avg > 0 && rate > 0 && Math.abs(avg - rate) / Math.max(avg, rate) > 0.005;
  if (!vfr) vfr = await packetsLookIrregular(path);

  return {
    path,
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fps,
    fpsFraction,
    frameCount,
    durationSec: Number.isFinite(durationSec) ? durationSec : frameCount / fps,
    codec: stream.codec_name ?? "unknown",
    vfr,
    audio: audioStream
      ? {
          codec: audioStream.codec_name ?? "unknown",
          sampleRate: Number.parseInt(audioStream.sample_rate ?? "", 10) || 0,
          channels: audioStream.channels ?? 0,
          channelLayout: audioStream.channel_layout || null,
        }
      : null,
  };
}
