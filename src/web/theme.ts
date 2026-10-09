import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
export type ThemeMode = "system" | Theme;

export const THEME_KEY = "framecue-theme";

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === "dark" || value === "light" ? value : "system";
}

export function resolveTheme(mode: ThemeMode, systemLight: boolean): Theme {
  if (mode === "system") return systemLight ? "light" : "dark";
  return mode;
}

function readStored(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

const QUERY = "(prefers-color-scheme: light)";

export interface ThemeState {
  mode: ThemeMode;
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export function useTheme(): ThemeState {
  const [mode, setModeState] = useState<ThemeMode>(readStored);
  const [systemLight, setSystemLight] = useState(() => window.matchMedia(QUERY).matches);
  const theme = resolveTheme(mode, systemLight);

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemLight(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      return;
    }
  }, []);

  const toggle = useCallback(() => setMode(theme === "dark" ? "light" : "dark"), [theme, setMode]);

  return { mode, theme, setMode, toggle };
}
