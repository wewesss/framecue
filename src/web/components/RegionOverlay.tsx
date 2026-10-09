import classigo from "classigo";
import { matcher } from "matchigo";
import { type PointerEvent, useRef, useState } from "react";
import type { Region } from "../../core/types";
import { clamp } from "../frame";
import { useT } from "../i18n";
import {
  drawRegion,
  HANDLES,
  type Handle,
  isUsable,
  moveRegion,
  regionPixels,
  resizeRegion,
} from "../stage/region";
import { Icon } from "../ui/Icon";

interface RegionOverlayProps {
  video: { width: number; height: number };
  region: Region | null;
  active: boolean;
  onCommit: (region: Region) => void;
}

type Gesture =
  | { kind: "draw"; origin: { x: number; y: number } }
  | { kind: "move"; origin: { x: number; y: number }; start: Region }
  | { kind: "resize"; origin: { x: number; y: number }; start: Region; handle: Handle };

const handleClass = matcher<Handle, string>()
  .with("nw", "region__h--nw")
  .with("n", "region__h--n")
  .with("ne", "region__h--ne")
  .with("e", "region__h--e")
  .with("se", "region__h--se")
  .with("s", "region__h--s")
  .with("sw", "region__h--sw")
  .with("w", "region__h--w")
  .exhaustive();

export function RegionOverlay({ video, region, active, onCommit }: RegionOverlayProps) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Region | null>(null);

  const point = (event: PointerEvent<HTMLElement>) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!active || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = point(event);
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as Handle | undefined;
    if (region && handle) gesture.current = { kind: "resize", origin, start: region, handle };
    else if (region && target.closest("[data-region]")) {
      gesture.current = { kind: "move", origin, start: region };
    } else gesture.current = { kind: "draw", origin };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(event);
    const dx = p.x - g.origin.x;
    const dy = p.y - g.origin.y;
    if (g.kind === "draw") setDraft(drawRegion(g.origin, p));
    else if (g.kind === "move") setDraft(moveRegion(g.start, dx, dy));
    else setDraft(resizeRegion(g.start, g.handle, dx, dy));
  };

  const finish = (commit: boolean) => {
    const result = draft;
    gesture.current = null;
    setDraft(null);
    if (commit && result && isUsable(result)) onCommit(result);
  };

  const shown = draft ?? region;
  const size = shown ? regionPixels(shown, video.width, video.height) : null;

  return (
    <div
      ref={rootRef}
      className={classigo("region-overlay", { "region-overlay--active": active })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
    >
      {shown && size && (
        <div
          data-region=""
          className="region"
          style={{
            left: `${shown.x * 100}%`,
            top: `${shown.y * 100}%`,
            width: `${shown.w * 100}%`,
            height: `${shown.h * 100}%`,
          }}
        >
          <span className="region__label num">
            <Icon name="crop" size={12} />
            {t("region.label", { w: size.w, h: size.h })}
          </span>
          {HANDLES.map((handle) => (
            <i
              key={handle}
              data-handle={handle}
              className={classigo("region__h", handleClass(handle))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
