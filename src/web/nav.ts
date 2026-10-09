import type { IntentEvent } from "@standarx/nav";
import { useIntent } from "@standarx/nav/react";
import { spatialPlugin } from "@standarx/nav/spatial";

export const navPlugins = [spatialPlugin({ mode: "app", pointerFollowsFocus: false })];

export const NATIVE =
  '[role="radiogroup"], [role="menu"], [role="dialog"], [role="alertdialog"], [data-native-keys]';
const SCRUB = "[data-stage], [data-timeline]";

export interface NavActions {
  step: (frames: number) => void;
}

function sibling(row: HTMLElement, direction: 1 | -1): HTMLElement | null {
  const next = direction === 1 ? row.nextElementSibling : row.previousElementSibling;
  return next instanceof HTMLElement && next.matches('[role="option"]') ? next : null;
}

export function useAppNav(actions: () => NavActions) {
  useIntent((event: IntentEvent) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (active.closest(NATIVE)) return "native";
    if (event.intent === "moveLeft" || event.intent === "moveRight") {
      if (!active.closest(SCRUB)) return false;
      actions().step(event.intent === "moveLeft" ? -1 : 1);
      return true;
    }
    if (event.intent === "moveUp" || event.intent === "moveDown") {
      if (!active.matches('[role="option"]')) return false;
      const target = sibling(active, event.intent === "moveUp" ? -1 : 1);
      if (!target) return false;
      target.focus();
      return true;
    }
    return false;
  });
}
