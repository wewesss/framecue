import classigo from "classigo";
import { matcher } from "matchigo";
import { type CSSProperties, type PointerEvent, useRef, useState } from "react";
import { regionColor } from "../../core/regions";
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
import { IconButton } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

interface RegionOverlayProps {
  video: { width: number; height: number };
  regions: Region[];
  active: boolean;
  onChange: (regions: Region[]) => void;
}

type Gesture =
  | { kind: "draw"; origin: { x: number; y: number } }
  | { kind: "move"; index: number; origin: { x: number; y: number }; start: Region }
  | {
      kind: "resize";
      index: number;
      origin: { x: number; y: number };
      start: Region;
      handle: Handle;
    };

interface Draft {
  index: number | null;
  region: Region;
}

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

function withDraft(regions: Region[], draft: Draft | null): Region[] {
  if (!draft) return regions;
  if (draft.index === null) return [...regions, draft.region];
  return regions.map((region, index) => (index === draft.index ? draft.region : region));
}

export function RegionOverlay({ video, regions, active, onChange }: RegionOverlayProps) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

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
    const target = event.target as HTMLElement;
    if (target.closest("[data-remove]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = point(event);
    const owner = target.closest<HTMLElement>("[data-region-index]");
    const index = owner ? Number(owner.dataset.regionIndex) : -1;
    const start = regions[index];
    const handle = target.dataset.handle as Handle | undefined;
    if (start && handle) gesture.current = { kind: "resize", index, origin, start, handle };
    else if (start) gesture.current = { kind: "move", index, origin, start };
    else gesture.current = { kind: "draw", origin };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(event);
    const dx = p.x - g.origin.x;
    const dy = p.y - g.origin.y;
    if (g.kind === "draw") setDraft({ index: null, region: drawRegion(g.origin, p) });
    else if (g.kind === "move") setDraft({ index: g.index, region: moveRegion(g.start, dx, dy) });
    else setDraft({ index: g.index, region: resizeRegion(g.start, g.handle, dx, dy) });
  };

  const finish = (commit: boolean) => {
    const result = draft;
    gesture.current = null;
    setDraft(null);
    if (commit && result && isUsable(result.region)) onChange(withDraft(regions, result));
  };

  const remove = (index: number) => onChange(regions.filter((_, i) => i !== index));

  const shown = withDraft(regions, draft);

  return (
    <div
      ref={rootRef}
      className={classigo("region-overlay", { "region-overlay--active": active })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
    >
      {shown.map((region, index) => {
        const color = regionColor(index);
        const size = regionPixels(region, video.width, video.height);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: regions have no id, their order is their identity
            key={index}
            data-region=""
            data-region-index={index}
            className="region"
            style={
              {
                "--rc": color.hex,
                "--rc-ink": color.ink,
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.w * 100}%`,
                height: `${region.h * 100}%`,
              } as CSSProperties
            }
          >
            <span className="region__label num">
              {t("region.label", { n: index + 1, w: size.w, h: size.h })}
              {active && (
                <Tooltip tip={t("region.remove", { n: index + 1 })}>
                  <IconButton
                    icon="xmark"
                    size="sm"
                    className="region__remove"
                    data-remove=""
                    label={t("region.remove", { n: index + 1 })}
                    onClick={() => remove(index)}
                  />
                </Tooltip>
              )}
            </span>
            {HANDLES.map((handle) => (
              <i
                key={handle}
                data-handle={handle}
                className={classigo("region__h", handleClass(handle))}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
