import { useCallback, useState } from "react";

export const NAV_KEY = "framecue-nav";

export function parseNav(value: string | null | undefined): boolean {
  return value === "on";
}

function readNav(): boolean {
  try {
    return parseNav(localStorage.getItem(NAV_KEY));
  } catch {
    return false;
  }
}

export function useKeyboardNav(): [boolean, (on: boolean) => void] {
  const [enabled, setEnabled] = useState(readNav);

  const set = useCallback((on: boolean) => {
    setEnabled(on);
    try {
      localStorage.setItem(NAV_KEY, on ? "on" : "off");
    } catch {
      return;
    }
  }, []);

  return [enabled, set];
}
