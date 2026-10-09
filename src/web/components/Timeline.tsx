import classigo from "classigo";
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Item } from "../../core/types";
import type { VideoResponse } from "../api";
import { channelsKey, fileName } from "../format";
import { clamp, formatTimecode } from "../frame";
import { useI18n } from "../i18n";
import type { Theme } from "../theme";
import { drawGrid, drawWave } from "../timeline/canvas";
import {
  CLIP_TOP,
  clampHeight,
  defaultHeight,
  LANE_GAP,
  lanes,
  MARKERS_H,
  RULER_H,
} from "../timeline/layout";
import {
  moveBracket,
  rangeFrom,
  type SnapExclude,
  type SnapResult,
  snapFrame,
  snapTargets,
} from "../timeline/snap";
import { rulerSteps } from "../timeline/ticks";
import { usePeaks } from "../timeline/usePeaks";
import type { TimelineView } from "../timeline/useTimelineView";
import {
  formatFactor,
  longPressView,
  spanOf,
  wheelFactor,
  wheelPanFrames,
  zoomFactor,
} from "../timeline/zoom";
import { Icon } from "../ui/Icon";
import { Tooltip } from "../ui/Tooltip";
import type { Filter } from "./QueuePanel";

export interface RangeSelection {
  in: number | null;
  out: number | null;
}

interface TimelineProps {
  video: VideoResponse;
  tl: TimelineView;
  frame: number;
  playing: boolean;
  items: Item[];
  rank: ReadonlyMap<string, number>;
  selectedId: string | null;
  filter: Filter;
  selection: RangeSelection;
  snap: boolean;
  longPress: boolean;
  wave: boolean;
  theme: Theme;
  onSeek: (frame: number) => void;
  onSelectItem: (item: Item) => void;
  onRange: (range: RangeSelection) => void;
}

type PressMode = "scrub" | "range" | "in" | "out";

interface Press {
  mode: PressMode;
  startX: number;
  anchor: number;
  dragged: boolean;
  timer: number | null;
}

interface Feedback extends SnapResult {
  show: boolean;
}

const HEIGHT_KEY = "framecue-timeline-h";
const LONG_PRESS_MS = 300;
const DRAG_PX = 4;

function readHeight(): number | null {
  try {
    const value = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeHeight(height: number | null) {
  try {
    if (height === null) localStorage.removeItem(HEIGHT_KEY);
    else localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
  } catch {
    return;
  }
}

export function Timeline({
  video,
  tl,
  frame,
  playing,
  items,
  rank,
  selectedId,
  filter,
  selection,
  snap,
  longPress,
  wave,
  theme,
  onSeek,
  onSelectItem,
  onRange,
}: TimelineProps) {
  const { t, lang } = useI18n();
  const { fps, frameCount: count } = video;
  const hasAudio = video.audio !== null;
  const peaks = usePeaks(hasAudio, video.sha256);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const press = useRef<Press | null>(null);
  const [userHeight, setUserHeight] = useState<number | null>(readHeight);
  const [viewportH, setViewportH] = useState(() => window.innerHeight);
  const [hover, setHover] = useState<{ x: number; frame: number } | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pressing, setPressing] = useState(false);
  const [saved, setSaved] = useState<{ v0: number; v1: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [handle, setHandle] = useState<"in" | "out" | null>(null);

  const { view, width } = tl;
  const span = spanOf(view);
  const ppf = width / span;
  const latest = useRef({ tl, selection, snap, longPress, saved, items, frame, fps, count });
  latest.current = { tl, selection, snap, longPress, saved, items, frame, fps, count };

  const waveOn = wave;
  const height = clampHeight(
    userHeight ?? defaultHeight({ wave: waveOn, audio: hasAudio }),
    viewportH,
  );
  const { clipH, audioH } = lanes(height, { wave: waveOn, audio: hasAudio });
  const xOf = (f: number) => ((f - view.v0) / span) * width;

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) tl.setWidth(entry.contentRect.width);
    });
    observer.observe(track);
    tl.setWidth(track.clientWidth);
    return () => observer.disconnect();
  }, [tl.setWidth]);

  useEffect(() => {
    if (press.current || saved) return;
    tl.follow(frame, playing);
  }, [frame, playing, saved, tl.follow]);

  useLayoutEffect(() => {
    const canvas = gridRef.current;
    if (!canvas || width <= 0) return;
    drawGrid(canvas, { width, height, view, fps, theme });
  }, [width, height, view, fps, theme]);

  useLayoutEffect(() => {
    const canvas = waveRef.current;
    if (!canvas || !peaks || audioH <= 0 || width <= 0) return;
    drawWave(canvas, { width, height: audioH, view, fps, theme, peaks });
  }, [width, audioH, view, fps, theme, peaks]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { tl: current, saved: lp } = latest.current;
      if (lp) return;
      const bounds = trackRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = clamp(event.clientX - bounds.left, 0, current.width);
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (event.shiftKey || horizontal) {
        const delta = horizontal ? event.deltaX : event.deltaY;
        current.pan(wheelPanFrames(delta, current.view, current.width));
        return;
      }
      const at = current.view.v0 + (x / current.width) * spanOf(current.view);
      current.zoomBy(wheelFactor(event.deltaY), at);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  const localX = (event: { clientX: number }) =>
    event.clientX - (trackRef.current?.getBoundingClientRect().left ?? 0);

  const posAt = (x: number) => view.v0 + (x / Math.max(1, width)) * span;
  const frameAt = (x: number) => clamp(Math.floor(posAt(x)), 0, count - 1);

  const resolve = (x: number, exclude: SnapExclude[], alt: boolean, dragged: boolean) => {
    const current = latest.current;
    const steps = rulerSteps(ppf, fps);
    const targets = snapTargets({
      items: current.items.map((item) => ({ start: item.frameStart, end: item.frameEnd })),
      inFrame: current.selection.in,
      outFrame: current.selection.out,
      playhead: current.frame,
      count,
      exclude,
    });
    return snapFrame({
      pos: posAt(x),
      ppf,
      count,
      targets,
      minor: steps.minor,
      enabled: current.snap && !alt && dragged,
    });
  };

  const startLongPress = () => {
    const p = press.current;
    if (!p || p.dragged || latest.current.saved) return;
    const current = latest.current.tl;
    setSaved(current.view);
    const anchor = current.view.v0 + (p.startX / current.width) * spanOf(current.view);
    current.apply(longPressView(anchor, p.startX / current.width, current.width));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-marker]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = clamp(localX(event), 0, width);
    const grabbed = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
    setFeedback(null);
    setHover(null);
    setPressing(true);
    if (grabbed === "in" || grabbed === "out") {
      press.current = { mode: grabbed, startX: x, anchor: 0, dragged: true, timer: null };
      setHandle(grabbed);
      return;
    }
    const exact = frameAt(x);
    if (event.shiftKey) {
      press.current = { mode: "range", startX: x, anchor: exact, dragged: false, timer: null };
      onRange({ in: exact, out: exact });
      return;
    }
    onSeek(exact);
    const timer = latest.current.longPress
      ? window.setTimeout(startLongPress, LONG_PRESS_MS)
      : null;
    press.current = { mode: "scrub", startX: x, anchor: exact, dragged: false, timer };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const x = clamp(localX(event), 0, Math.max(width - 1, 0));
    const p = press.current;
    if (!p) {
      const f = frameAt(x);
      setHover({ x: xOf(f + 0.5), frame: f });
      return;
    }
    if (!p.dragged && Math.abs(x - p.startX) > DRAG_PX) {
      p.dragged = true;
      if (p.timer !== null && !latest.current.saved) window.clearTimeout(p.timer);
      p.timer = null;
    }
    const alt = event.altKey;
    if (p.mode === "scrub") {
      const result = resolve(x, ["playhead"], alt, p.dragged);
      onSeek(result.frame);
      setFeedback({ ...result, show: p.dragged });
    } else if (p.mode === "range") {
      const result = resolve(x, ["in", "out"], alt, p.dragged);
      const next = rangeFrom(p.anchor, result.frame);
      onRange({ in: next.inFrame, out: next.outFrame });
      setFeedback({ ...result, show: p.dragged });
    } else {
      const result = resolve(x, [p.mode], alt, true);
      const { selection: current } = latest.current;
      const next = moveBracket(
        { inFrame: current.in, outFrame: current.out },
        p.mode,
        result.frame,
      );
      if (p.mode === "in" && next.inFrame !== result.frame) p.mode = "out";
      else if (p.mode === "out" && next.outFrame !== result.frame) p.mode = "in";
      setHandle(p.mode);
      onRange({ in: next.inFrame, out: next.outFrame });
      setFeedback({ ...result, show: true });
    }
  };

  const release = () => {
    const p = press.current;
    if (!p) return;
    if (p.timer !== null) window.clearTimeout(p.timer);
    press.current = null;
    setHandle(null);
    setPressing(false);
    setFeedback(null);
    const lp = latest.current.saved;
    if (lp) {
      latest.current.tl.restore(lp);
      setSaved(null);
    }
  };

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
    const y0 = event.clientY;
    const h0 = rootRef.current?.getBoundingClientRect().height ?? height;
    const target = event.currentTarget;
    let next = h0;
    const move = (e: globalThis.PointerEvent) => {
      next = clampHeight(h0 - (e.clientY - y0), window.innerHeight);
      setUserHeight(next);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setResizing(false);
      writeHeight(next);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const resetHeight = () => {
    setUserHeight(null);
    writeHeight(null);
  };

  const hasBand = selection.in !== null || selection.out !== null;
  const bandA = selection.in ?? frame;
  const bandB = selection.out ?? frame;
  const bandX0 = xOf(Math.min(bandA, bandB));
  const bandX1 = xOf(Math.max(bandA, bandB) + 1);
  const bandW = Math.max(2, bandX1 - bandX0);
  const bandFrames = Math.abs(bandB - bandA) + 1;
  const inHandle =
    selection.in !== null ? xOf(Math.min(selection.in, selection.out ?? selection.in)) : null;
  const outHandle =
    selection.out !== null ? xOf(Math.max(selection.out, selection.in ?? selection.out) + 1) : null;

  const pill = feedback?.show ? { x: xOf(feedback.frame), frame: feedback.frame } : hover;
  const pillSnapped = feedback?.show === true && feedback.hit;
  const channels = video.audio ? channelsKey(video.audio.channels) : null;
  const decimal = lang === "fr" ? "," : ".";
  const k = zoomFactor(view, count);

  const style = { height } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={classigo("timeline", { "timeline--lp": saved !== null })}
      data-timeline
      role="slider"
      tabIndex={0}
      aria-label={t("timeline.label")}
      aria-valuemin={0}
      aria-valuemax={Math.max(count - 1, 0)}
      aria-valuenow={frame}
      style={style}
    >
      <Tooltip tip={t("timeline.resize")}>
        <div
          className={classigo("timeline__resize", { "timeline__resize--drag": resizing })}
          aria-hidden="true"
          onPointerDown={startResize}
          onDoubleClick={resetHeight}
        />
      </Tooltip>
      {saved && (
        <div className="timeline__chip">
          <Icon name="hand.point.up" size={14} />
          <b className="num">×{formatFactor(k, decimal)}</b>
          <span className="muted num">
            {t("timeline.lpRange", { a: Math.round(view.v0), b: Math.round(view.v1) })}
          </span>
          <span className="muted">· {t("timeline.lpRelease")}</span>
        </div>
      )}
      <div
        ref={trackRef}
        className={classigo("timeline__track", { "timeline__track--press": pressing })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={() => setHover(null)}
      >
        <div className="timeline__ruler" style={{ height: RULER_H }} />
        <div className="timeline__lanes" style={{ top: RULER_H }} />
        <canvas ref={gridRef} className="timeline__grid" />

        <div className="timeline__markers" style={{ top: RULER_H, height: MARKERS_H }}>
          {items.map((item) => {
            const isRange = item.frameEnd > item.frameStart;
            const x0 = isRange ? xOf(item.frameStart) : xOf(item.frameStart + 0.5);
            const w = isRange ? Math.max(4, Math.min(xOf(item.frameEnd + 1), xOf(count)) - x0) : 0;
            if (item.frameStart >= count || x0 + w < -12 || x0 > width + 12) return null;
            const selected = item.id === selectedId;
            const number = rank.get(item.id) ?? 0;
            const first = item.comment.split("\n")[0] ?? "";
            const tip = `#${number} · ${t(`kind.${item.kind}`)} · ${t(`status.${item.status}`)}${first ? ` — ${first}` : ""}`;
            return (
              <Tooltip key={item.id} tip={tip}>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={tip}
                  data-marker={item.id}
                  className={classigo(
                    "mk",
                    `mk--${item.status}`,
                    isRange ? "mk--bar" : "mk--tick",
                    {
                      "mk--region": item.kind === "region",
                      "mk--selected": selected,
                      "mk--dim": filter !== "all" && item.status !== filter,
                    },
                  )}
                  style={{ left: x0, width: isRange ? w : undefined }}
                  onClick={() => onSelectItem(item)}
                />
              </Tooltip>
            );
          })}
          {items.map((item) => {
            if (item.id !== selectedId || item.frameStart >= count) return null;
            const isRange = item.frameEnd > item.frameStart;
            const x0 = isRange ? xOf(item.frameStart) : xOf(item.frameStart + 0.5);
            const w = isRange ? Math.max(4, Math.min(xOf(item.frameEnd + 1), xOf(count)) - x0) : 0;
            return (
              <span key={item.id} className="mk__num" style={{ left: Math.max(x0, 0) + w + 8 }}>
                #{rank.get(item.id)}
              </span>
            );
          })}
        </div>

        <div className="timeline__clip" style={{ top: CLIP_TOP, height: clipH }}>
          <div
            className="timeline__clip-bar"
            style={{ left: xOf(0), width: xOf(count) - xOf(0) }}
          />
          <span className="lane-name" style={{ left: Math.max(0, xOf(0)) + 6 }}>
            <Icon name="film" size={12} />
            {fileName(video.path)}
          </span>
        </div>

        {audioH > 0 && waveOn && (
          <div
            className={classigo("timeline__audio", { "timeline__audio--none": !hasAudio })}
            style={{ top: CLIP_TOP + clipH + LANE_GAP, height: audioH }}
          >
            {hasAudio ? (
              <>
                <canvas ref={waveRef} className="timeline__wave" />
                <span className="lane-name lane-name--audio">
                  <Icon name="waveform" size={12} />
                  {t("timeline.audioLane", {
                    channels: channels
                      ? t(channels)
                      : t("audio.channels", { n: video.audio?.channels ?? 0 }),
                  })}
                </span>
              </>
            ) : (
              <span className="timeline__none">
                <Icon name="speaker.slash" size={14} />
                {t("timeline.noAudio")}
              </span>
            )}
          </div>
        )}

        {hasBand && (
          <div className="timeline__band" style={{ left: bandX0, width: bandW }}>
            {bandW > 54 && (
              <span className="timeline__band-label num">
                {t("unit.frames", { n: bandFrames })}
              </span>
            )}
          </div>
        )}

        {feedback?.show && feedback.hit && (
          <>
            <i className="timeline__snap" style={{ left: xOf(feedback.frame), top: RULER_H }} />
            {feedback.tick && (
              <i className="timeline__snap-tick" style={{ left: xOf(feedback.frame) }} />
            )}
          </>
        )}

        {inHandle !== null && (
          <Tooltip tip={t("timeline.inHandle")} keys={[t("key.alt")]}>
            <i
              data-handle="in"
              className={classigo("io-handle", { "io-handle--drag": handle === "in" })}
              style={{ left: inHandle }}
            />
          </Tooltip>
        )}
        {outHandle !== null && (
          <Tooltip tip={t("timeline.outHandle")} keys={[t("key.alt")]}>
            <i
              data-handle="out"
              className={classigo("io-handle", {
                "io-handle--drag": handle === "out",
              })}
              style={{ left: outHandle }}
            />
          </Tooltip>
        )}

        {pill && (
          <div
            className={classigo("timeline__hover", {
              "timeline__hover--flip": pill.x > width - (pillSnapped ? 150 : 130),
              "timeline__hover--snapped": pillSnapped,
            })}
            style={{ left: pill.x }}
          >
            <span className="num">
              {pill.frame} · {formatTimecode(pill.frame, fps).slice(3)}
              {pillSnapped ? ` · ${t("timeline.snapped")}` : ""}
            </span>
          </div>
        )}

        {frame + 0.5 >= view.v0 - 1 && frame <= view.v1 + 1 && (
          <div className="timeline__playhead" style={{ left: xOf(frame + 0.5) }} />
        )}
      </div>
    </div>
  );
}
