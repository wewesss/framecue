import classigo from "classigo";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { Item } from "../../core/types";
import { useT } from "../i18n";
import type { TimelineView } from "../timeline/useTimelineView";
import { isFit, overviewPan, spanOf, wheelPanFrames } from "../timeline/zoom";
import { Tooltip } from "../ui/Tooltip";

interface OverviewProps {
  tl: TimelineView;
  items: Item[];
  frame: number;
}

export function Overview({ tl, items, frame }: OverviewProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const grab = useRef(0);
  const latest = useRef(tl);
  latest.current = tl;
  const { view, count } = tl;
  const fit = isFit(view, count);

  const frameAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return ((clientX - rect.left) / rect.width) * count;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const onWindow = (event.target as HTMLElement).dataset.window !== undefined;
    grab.current = onWindow ? frameAt(event.clientX) - view.v0 : spanOf(view) / 2;
    setDrag(true);
    tl.apply(overviewPan(frameAt(event.clientX), grab.current, view));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    tl.apply(overviewPan(frameAt(event.clientX), grab.current, latest.current.view));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = latest.current;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      current.pan(wheelPanFrames(delta, current.view, current.width));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const pct = (f: number) => `${(f / Math.max(count, 1)) * 100}%`;

  return (
    <div
      ref={ref}
      className={classigo("ov", { "ov--fit": fit, "ov--drag": drag })}
      role="img"
      aria-label={t("tools.overview")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
    >
      {items
        .filter((item) => item.frameStart < count)
        .map((item) => (
          <i
            key={item.id}
            className="ov__mark"
            style={{
              left: pct((item.frameStart + item.frameEnd + 1) / 2),
              background: `var(--status-${item.status})`,
            }}
          />
        ))}
      <i className="ov__playhead" style={{ left: pct(frame + 0.5) }} />
      <Tooltip tip={t("tools.overviewWindow")} keys={[[t("key.shift"), t("tools.wheel")]]}>
        <div
          data-window=""
          className="ov__window"
          style={{ left: pct(view.v0), width: `${(spanOf(view) / Math.max(count, 1)) * 100}%` }}
        />
      </Tooltip>
    </div>
  );
}
