import classigo from "classigo";
import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Region } from "../../core/types";
import { streamUrl } from "../api";
import { useT } from "../i18n";
import {
  activePreset,
  canPan,
  clampPan,
  fitScale,
  NO_PAN,
  type Pan,
  percent,
  pictureRect,
  presetScale,
  wheelScale,
  type ZoomPreset,
  zoomAtPoint,
} from "../stage/geometry";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { RegionOverlay } from "./RegionOverlay";

interface StageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  video: { width: number; height: number };
  region: Region | null;
  regionMode: boolean;
  onRegion: (region: Region) => void;
}

interface PanDrag {
  pointerId: number;
  x: number;
  y: number;
  pan: Pan;
}

export function Stage({ videoRef, video, region, regionMode, onRegion }: StageProps) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [rawPan, setRawPan] = useState<Pan>(NO_PAN);
  const [panning, setPanning] = useState(false);
  const drag = useRef<PanDrag | null>(null);

  const fit = fitScale(box, video);
  const scale = zoom === null ? fit : Math.max(zoom, fit);
  const pan = zoom === null ? NO_PAN : clampPan(rawPan, box, video, scale);
  const rect = pictureRect(box, video, scale, pan);
  const movable = canPan(box, video, scale);
  const preset = activePreset(scale, fit);
  const latest = useRef({ box, scale, pan, fit });
  latest.current = { box, scale, pan, fit };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const current = latest.current;
      const bounds = el.getBoundingClientRect();
      const point = {
        x: event.clientX - bounds.left - current.box.w / 2,
        y: event.clientY - bounds.top - current.box.h / 2,
      };
      const next = wheelScale(current.scale, event.deltaY, current.fit);
      setRawPan(
        clampPan(zoomAtPoint(current.scale, next, current.pan, point), current.box, video, next),
      );
      setZoom(Math.abs(next - current.fit) < 1e-6 ? null : next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [video]);

  const choose = useCallback(
    (value: ZoomPreset) => {
      const current = latest.current;
      const next = presetScale(value, current.fit);
      if (value === "fit") {
        setZoom(null);
        setRawPan(NO_PAN);
        return;
      }
      setZoom(next);
      setRawPan(
        clampPan(
          zoomAtPoint(current.scale, next, current.pan, { x: 0, y: 0 }),
          current.box,
          video,
          next,
        ),
      );
    },
    [video],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || regionMode || !movable) return;
    if ((event.target as HTMLElement).closest("[data-hud]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
    setPanning(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const next = { x: d.pan.x + event.clientX - d.x, y: d.pan.y + event.clientY - d.y };
    setRawPan(clampPan(next, box, video, scale));
    if (zoom === null) setZoom(scale);
  };

  const endPan = () => {
    drag.current = null;
    setPanning(false);
  };

  const options: SegmentOption<ZoomPreset>[] = [
    { value: "fit", content: t("stage.zoomFit") },
    { value: "100", content: "100 %" },
    { value: "200", content: "200 %" },
  ];

  return (
    <div
      className={classigo("stage", {
        "stage--movable": movable && !regionMode,
        "stage--panning": panning,
      })}
      ref={boxRef}
      data-stage
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is the keyboard target for frame stepping
      tabIndex={0}
      role="application"
      aria-label={t("stage.label")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <div
        className="stage__picture"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      >
        <video ref={videoRef} className="stage__video" src={streamUrl} preload="auto" muted>
          <track kind="captions" />
        </video>
        <RegionOverlay video={video} region={region} active={regionMode} onCommit={onRegion} />
      </div>
      <div className="stage__hud" data-hud>
        <span className="stage__chip num">
          {preset === "fit"
            ? t("stage.hudFit", { n: percent(scale) })
            : t("stage.hudZoom", { n: percent(scale) })}
        </span>
      </div>
      <div className="stage__zoom" data-hud>
        <SegmentedControl<ZoomPreset>
          label={t("stage.zoom")}
          variant="mini"
          value={preset}
          options={options}
          onChange={choose}
        />
      </div>
    </div>
  );
}
