import classigo from "classigo";
import { type KeyboardEvent, useState } from "react";
import { formatTimecode } from "../frame";
import { useT } from "../i18n";
import type { Selection } from "../types";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { Tooltip } from "../ui/Tooltip";

interface TransportProps {
  frame: number;
  fps: number;
  frameCount: number;
  playing: boolean;
  selection: Selection;
  regionMode: boolean;
  busy: boolean;
  onToggle: () => void;
  onStep: (n: number) => void;
  onSeek: (frame: number) => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onToggleRegion: () => void;
  onClear: () => void;
  onAdd: () => void;
}

function parseFrame(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? null : value;
}

export function Transport({
  frame,
  fps,
  frameCount,
  playing,
  selection,
  regionMode,
  busy,
  onToggle,
  onStep,
  onSeek,
  onSetIn,
  onSetOut,
  onToggleRegion,
  onClear,
  onAdd,
}: TransportProps) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const last = Math.max(frameCount - 1, 0);
  const shift = t("key.shift");

  const commit = () => {
    const value = draft === null ? null : parseFrame(draft);
    setDraft(null);
    if (value !== null) onSeek(Math.min(Math.max(value, 0), last));
  };

  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraft(null);
      event.currentTarget.blur();
    }
  };

  const hasRange = selection.in !== null && selection.out !== null;
  const duration = hasRange ? Math.abs((selection.out ?? 0) - (selection.in ?? 0)) + 1 : 1;
  const hasSelection = selection.in !== null || selection.out !== null || selection.region !== null;

  return (
    <section className="transport" aria-label={t("transport.label")}>
      <div className="transport__readout">
        <Tooltip tip={t("transport.timecode")}>
          <span className="transport__tc num">{formatTimecode(frame, fps)}</span>
        </Tooltip>
        <Tooltip tip={t("transport.goTo")}>
          <label className="frame-field">
            <span className="frame-field__label">{t("transport.frame")}</span>
            <input
              className="frame-field__input num"
              inputMode="numeric"
              aria-label={t("transport.frameNumber")}
              value={draft ?? String(frame)}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
              onBlur={commit}
              onKeyDown={onFieldKey}
            />
            <span className="frame-field__total num">/ {last}</span>
          </label>
        </Tooltip>
      </div>

      <div className="transport__controls">
        <Tooltip tip={t("transport.first")} keys={[t("key.home")]}>
          <IconButton icon="backward.end" label={t("transport.first")} onClick={() => onSeek(0)} />
        </Tooltip>
        <Tooltip tip={t("transport.back10")} keys={[[shift, "←"]]}>
          <IconButton
            icon="chevron.left.2"
            label={t("transport.back10")}
            onClick={() => onStep(-10)}
          />
        </Tooltip>
        <Tooltip tip={t("transport.prev")} keys={["←", ","]}>
          <IconButton icon="chevron.left" label={t("transport.prev")} onClick={() => onStep(-1)} />
        </Tooltip>
        <Tooltip tip={playing ? t("transport.pause") : t("transport.play")} keys={[t("key.space")]}>
          <IconButton
            variant="play"
            icon={playing ? "pause" : "play"}
            filled
            label={playing ? t("transport.pause") : t("transport.play")}
            onClick={onToggle}
          />
        </Tooltip>
        <Tooltip tip={t("transport.next")} keys={["→", "."]}>
          <IconButton icon="chevron.right" label={t("transport.next")} onClick={() => onStep(1)} />
        </Tooltip>
        <Tooltip tip={t("transport.forward10")} keys={[[shift, "→"]]}>
          <IconButton
            icon="chevron.right.2"
            label={t("transport.forward10")}
            onClick={() => onStep(10)}
          />
        </Tooltip>
        <Tooltip tip={t("transport.last")} keys={[t("key.end")]}>
          <IconButton icon="forward.end" label={t("transport.last")} onClick={() => onSeek(last)} />
        </Tooltip>
      </div>

      <div className="transport__selection">
        {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own border and legend layout */}
        <div className="sel" role="group" aria-label={t("sel.label")}>
          <Tooltip tip={t("sel.in")} keys={["I"]}>
            <Button variant="plain" className="sel__btn" onClick={onSetIn}>
              <Icon
                name="arrow.down.to.line"
                size={16}
                rotate={90}
                className={classigo({ sel__set: selection.in !== null })}
              />
              <span className="num">{selection.in ?? "—"}</span>
            </Button>
          </Tooltip>
          <Tooltip tip={t("sel.out")} keys={["O"]}>
            <Button variant="plain" className="sel__btn" onClick={onSetOut}>
              <Icon
                name="arrow.down.to.line"
                size={16}
                rotate={-90}
                className={classigo({ sel__set: selection.out !== null })}
              />
              <span className="num">{selection.out ?? "—"}</span>
            </Button>
          </Tooltip>
          <span className="sel__dur num">{t("unit.frames", { n: duration })}</span>
          <Tooltip tip={t("sel.region")} keys={["R"]}>
            <IconButton
              icon="crop"
              label={t("sel.region")}
              size="sm"
              pressed={regionMode}
              onClick={onToggleRegion}
            />
          </Tooltip>
          <Tooltip tip={t("sel.clear")} keys={[t("key.esc")]}>
            <IconButton
              icon="xmark"
              label={t("sel.clear")}
              size="sm"
              disabled={!hasSelection && !regionMode}
              onClick={onClear}
            />
          </Tooltip>
        </div>
        <Tooltip tip={t("sel.add")} keys={[t("key.enter")]}>
          <Button variant="primary" icon="plus" className="add" disabled={busy} onClick={onAdd}>
            <span className="add__long">{t("sel.addLabel")}</span>
            <span className="add__short">{t("sel.addShort")}</span>
            <Kbd>↵</Kbd>
          </Button>
        </Tooltip>
      </div>
    </section>
  );
}
