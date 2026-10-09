import type { RefObject } from "react";
import { type Lang, useI18n } from "../i18n";
import type { ThemeMode } from "../theme";
import { Popover } from "../ui/Popover";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Switch } from "../ui/Switch";

interface SettingsPopoverProps {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  themeMode: ThemeMode;
  navEnabled: boolean;
  onThemeMode: (mode: ThemeMode) => void;
  onNavEnabled: (on: boolean) => void;
  onClose: () => void;
}

const LANG_OPTIONS = [
  { value: "fr" as const, content: "FR", label: "Français" },
  { value: "en" as const, content: "EN", label: "English" },
];

export function SettingsPopover({
  open,
  anchor,
  themeMode,
  navEnabled,
  onThemeMode,
  onNavEnabled,
  onClose,
}: SettingsPopoverProps) {
  const { t, lang, setLang } = useI18n();

  const themeOptions = [
    { value: "system" as const, content: t("settings.themeSystem") },
    { value: "light" as const, content: t("settings.themeLight") },
    { value: "dark" as const, content: t("settings.themeDark") },
  ];

  return (
    <Popover
      open={open}
      anchor={anchor}
      align="right"
      label={t("settings.title")}
      className="popover--settings"
      autoFocus="input[role=switch]"
      onClose={onClose}
    >
      <div className="settings">
        <h2 className="settings__title">{t("settings.title")}</h2>
        <div className="settings__row">
          <div className="settings__head">
            <Switch checked={navEnabled} onChange={onNavEnabled}>
              {t("settings.nav")}
            </Switch>
            <span className="settings__badge">{t("settings.experimental")}</span>
          </div>
          <p className="settings__desc">{t("settings.navDesc")}</p>
        </div>
        <div className="settings__row settings__row--inline">
          <span className="settings__label">{t("settings.theme")}</span>
          <SegmentedControl<ThemeMode>
            label={t("settings.theme")}
            variant="mini"
            value={themeMode}
            options={themeOptions}
            onChange={onThemeMode}
          />
        </div>
        <div className="settings__row settings__row--inline">
          <span className="settings__label">{t("settings.lang")}</span>
          <SegmentedControl<Lang>
            label={t("settings.lang")}
            variant="mini"
            value={lang}
            options={LANG_OPTIONS}
            onChange={setLang}
          />
        </div>
      </div>
    </Popover>
  );
}
