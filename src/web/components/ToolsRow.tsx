import type { Item } from "../../core/types";
import { useI18n } from "../i18n";
import { divLabel, rulerSteps } from "../timeline/ticks";
import type { TimelineView } from "../timeline/useTimelineView";
import { atMaxZoom, formatFactor, isFit, ZOOM_STEP, zoomFactor } from "../timeline/zoom";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Switch } from "../ui/Switch";
import { Tooltip } from "../ui/Tooltip";
import { Overview } from "./Overview";

function titled(label: string, text: string) {
  return (
    <>
      <b>{label}</b> · {text}
    </>
  );
}

interface ToolsRowProps {
  tl: TimelineView;
  items: Item[];
  frame: number;
  fps: number;
  hasAudio: boolean;
  wave: boolean;
  snap: boolean;
  longPress: boolean;
  onWave: (on: boolean) => void;
  onSnap: (on: boolean) => void;
  onLongPress: (on: boolean) => void;
}

export function ToolsRow({
  tl,
  items,
  frame,
  fps,
  hasAudio,
  wave,
  snap,
  longPress,
  onWave,
  onSnap,
  onLongPress,
}: ToolsRowProps) {
  const { t, lang } = useI18n();
  const { view, width, count } = tl;
  const fit = isFit(view, count);
  const max = atMaxZoom(view, width);
  const k = zoomFactor(view, count);
  const steps = rulerSteps(width / (view.v1 - view.v0), fps);
  const div = divLabel(steps.label, fps);
  const divText = t(
    div.unit === "frames"
      ? "timeline.divFrames"
      : div.unit === "seconds"
        ? "timeline.divSeconds"
        : "timeline.divMinutes",
    { n: div.value },
  );
  const decimal = lang === "fr" ? "," : ".";
  const around = frame + 0.5;

  const waveTip = !hasAudio
    ? t("tools.waveNone")
    : wave
      ? t("tools.waveHide")
      : t("tools.waveShow");

  return (
    <div className="tools" role="toolbar" aria-label={t("tools.label")} data-snav="container">
      <div className="tools__switches">
        <Tooltip tip={titled(t("tools.audio"), waveTip)}>
          <Switch
            icon="waveform"
            label={t("tools.audio")}
            checked={hasAudio && wave}
            disabled={!hasAudio}
            onChange={onWave}
          />
        </Tooltip>
        <Tooltip tip={titled(t("tools.snap"), t("tools.snapTip"))} keys={["S"]}>
          <Switch icon="pin" label={t("tools.snap")} checked={snap} onChange={onSnap} />
        </Tooltip>
        <Tooltip tip={titled(t("tools.longPress"), t("tools.longPressTip"))}>
          <Switch
            icon="hand.point.up"
            label={t("tools.longPress")}
            checked={longPress}
            onChange={onLongPress}
          />
        </Tooltip>
      </div>
      <Overview tl={tl} items={items} frame={frame} />
      <div className="tools__zoom">
        <Tooltip tip={t("tools.zoomOut")} keys={["-"]}>
          <IconButton
            icon="minus.magnifyingglass"
            label={t("tools.zoomOut")}
            size="sm"
            disabled={fit}
            onClick={() => tl.zoomBy(1 / ZOOM_STEP, around)}
          />
        </Tooltip>
        <Tooltip tip={t("tools.zoomRead")}>
          <span className="tools__read num">
            <b>×{formatFactor(k, decimal)}</b>
            <span className="tools__div"> · {t("tools.perDiv", { div: divText })}</span>
          </span>
        </Tooltip>
        <Tooltip tip={t("tools.zoomIn")} keys={["+"]}>
          <IconButton
            icon="plus.magnifyingglass"
            label={t("tools.zoomIn")}
            size="sm"
            disabled={max}
            onClick={() => tl.zoomBy(ZOOM_STEP, around)}
          />
        </Tooltip>
        <Tooltip tip={t("tools.fitTip")} keys={[[t("key.shift"), "Z"]]}>
          <Button variant="plain" className="tools__fit" disabled={fit} onClick={tl.fit}>
            <Icon name="arrow.up.left.and.arrow.down.right" size={14} rotate={-45} />
            <span className="tools__fit-label">{t("tools.fit")}</span>
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
