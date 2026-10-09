import { useCallback, useMemo, useRef, useState } from "react";
import {
  FIT_VIEW,
  followPlayhead,
  makeView,
  panBy,
  type RawView,
  type View,
  zoomAround,
} from "./zoom";

export interface TimelineView {
  view: View;
  width: number;
  count: number;
  setWidth: (width: number) => void;
  apply: (raw: RawView) => void;
  zoomBy: (factor: number, anchor: number) => void;
  fit: () => void;
  pan: (frames: number) => void;
  follow: (frame: number, playing: boolean) => void;
  restore: (view: View) => void;
}

export function useTimelineView(count: number): TimelineView {
  const [raw, setRaw] = useState<RawView>(FIT_VIEW);
  const [width, setWidthState] = useState(0);
  const view = useMemo(() => makeView(raw, count, width), [raw, count, width]);
  const latest = useRef({ view, count, width });
  latest.current = { view, count, width };

  const setWidth = useCallback((next: number) => {
    setWidthState((current) => (Math.abs(current - next) < 0.5 ? current : next));
  }, []);

  const apply = useCallback((next: RawView) => {
    const { count: n, width: w } = latest.current;
    const clamped = makeView(next, n, w);
    setRaw({ v0: clamped.v0, span: clamped.v1 - clamped.v0 });
  }, []);

  const zoomBy = useCallback(
    (factor: number, anchor: number) => {
      const { view: current, count: n, width: w } = latest.current;
      apply(zoomAround(current, factor, anchor, n, w));
    },
    [apply],
  );

  const fit = useCallback(() => setRaw(FIT_VIEW), []);

  const pan = useCallback((frames: number) => apply(panBy(latest.current.view, frames)), [apply]);

  const follow = useCallback(
    (frame: number, playing: boolean) => {
      const { view: current, count: n } = latest.current;
      const next = followPlayhead(current, frame, playing, n);
      if (next) apply(next);
    },
    [apply],
  );

  const restore = useCallback(
    (saved: View) => apply({ v0: saved.v0, span: saved.v1 - saved.v0 }),
    [apply],
  );

  return { view, width, count, setWidth, apply, zoomBy, fit, pan, follow, restore };
}
