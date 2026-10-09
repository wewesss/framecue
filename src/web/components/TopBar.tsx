import { useRef, useState } from "react";
import type { VideoResponse } from "../api";
import {
  aspectRatio,
  audioCodecLabel,
  channelsKey,
  fileName,
  fpsValue,
  joinPath,
  sampleRateLabel,
  videoCodecLabel,
} from "../format";
import { formatTimecode } from "../frame";
import { useI18n } from "../i18n";
import type { Theme, ThemeMode } from "../theme";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Popover } from "../ui/Popover";
import { Tooltip } from "../ui/Tooltip";
import { SettingsPopover } from "./SettingsPopover";

interface TopBarProps {
  info: VideoResponse | null;
  theme: Theme;
  themeMode: ThemeMode;
  navEnabled: boolean;
  helpOpen: boolean;
  onToggleTheme: () => void;
  onThemeMode: (mode: ThemeMode) => void;
  onNavEnabled: (on: boolean) => void;
  onToggleHelp: () => void;
}

export function TopBar({
  info,
  theme,
  themeMode,
  navEnabled,
  helpOpen,
  onToggleTheme,
  onThemeMode,
  onNavEnabled,
  onToggleHelp,
}: TopBarProps) {
  const { t } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLButtonElement>(null);

  const audio = info?.audio ?? null;
  const channels = audio ? channelsKey(audio.channels) : null;
  const audioMeta = audio
    ? `${audioCodecLabel(audio.codec)} ${sampleRateLabel(audio.sampleRate)}`
    : t("topbar.noAudio");
  const audioFull = audio
    ? [
        audioCodecLabel(audio.codec),
        sampleRateLabel(audio.sampleRate),
        channels ? t(channels) : t("audio.channels", { n: audio.channels }),
      ].join(" · ")
    : t("file.noAudio");

  return (
    <header className="topbar" data-snav="container">
      <div className="topbar__brand">
        <i className="topbar__mark" aria-hidden="true" />
        <span className="topbar__word">
          frame<span>cue</span>
        </span>
      </div>
      {info && (
        <>
          <div className="topbar__divider" />
          <button
            ref={fileRef}
            type="button"
            className="file"
            aria-expanded={infoOpen}
            aria-haspopup="dialog"
            onClick={() => setInfoOpen((open) => !open)}
          >
            <span className="file__name">{fileName(info.path)}</span>
            <span className="file__meta num">
              <span>
                {info.width}×{info.height}
              </span>
              <span>{t("unit.fps", { n: fpsValue(info.fps) })}</span>
              <span>{audioMeta}</span>
            </span>
            <Icon name="chevron.down" size={14} className="file__chev" />
          </button>
          <Popover
            open={infoOpen}
            anchor={fileRef}
            label={t("topbar.fileInfo")}
            className="popover--file"
            onClose={() => setInfoOpen(false)}
          >
            <div className="fileinfo">
              <dl>
                <dt>{t("file.path")}</dt>
                <dd>{info.path}</dd>
                <dt>{t("file.frame")}</dt>
                <dd>
                  {info.width} × {info.height} · {aspectRatio(info.width, info.height)}
                </dd>
                <dt>{t("file.rate")}</dt>
                <dd>
                  {t("unit.fps", { n: fpsValue(info.fps) })}
                  {info.vfr && ` (${t("file.variable")})`}
                </dd>
                <dt>{t("file.duration")}</dt>
                <dd>
                  {formatTimecode(info.frameCount, info.fps)} ·{" "}
                  {t("unit.frames", { n: info.frameCount })}
                </dd>
                <dt>{t("file.video")}</dt>
                <dd>{videoCodecLabel(info.codec)}</dd>
                <dt>{t("file.audio")}</dt>
                <dd>{audioFull}</dd>
                <dt>{t("file.queue")}</dt>
                <dd>{joinPath(info.workspace, "queue.jsonl")}</dd>
              </dl>
              {info.vfr && (
                <div className="fileinfo__warn">
                  <Icon name="exclamationmark.triangle" size={14} />
                  <span>{t("file.vfrWarn")}</span>
                </div>
              )}
            </div>
          </Popover>
          {info.vfr && (
            <Tooltip tip={t("topbar.vfrTip")}>
              <button type="button" className="vfr" onClick={() => setInfoOpen(true)}>
                <Icon name="exclamationmark.triangle" size={12} />
                VFR
              </button>
            </Tooltip>
          )}
        </>
      )}
      <div className="spacer" />
      <div className="topbar__actions">
        <Tooltip tip={theme === "dark" ? t("topbar.themeLight") : t("topbar.themeDark")}>
          <IconButton
            icon={theme === "dark" ? "sun.max" : "moon"}
            label={theme === "dark" ? t("topbar.themeLight") : t("topbar.themeDark")}
            onClick={onToggleTheme}
          />
        </Tooltip>
        <Tooltip tip={t("topbar.settings")}>
          <IconButton
            ref={gearRef}
            icon="gearshape"
            label={t("topbar.settings")}
            pressed={settingsOpen}
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen((open) => !open)}
          />
        </Tooltip>
        <Tooltip tip={t("topbar.help")} keys={["?"]}>
          <IconButton
            icon="questionmark.circle"
            label={t("topbar.help")}
            pressed={helpOpen}
            onClick={onToggleHelp}
          />
        </Tooltip>
      </div>
      <SettingsPopover
        open={settingsOpen}
        anchor={gearRef}
        themeMode={themeMode}
        navEnabled={navEnabled}
        onThemeMode={onThemeMode}
        onNavEnabled={onNavEnabled}
        onClose={() => setSettingsOpen(false)}
      />
    </header>
  );
}
