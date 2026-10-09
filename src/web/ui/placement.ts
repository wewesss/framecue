export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface TipPosition {
  top: number;
  left: number;
}

const TIP_GAP = 8;
const VIEWPORT_MARGIN = 6;
const MENU_GAP = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placeTip(target: Box, tip: Size, viewport: Size): TipPosition {
  let top = target.top - tip.height - TIP_GAP;
  if (top < 4) top = target.top + target.height + TIP_GAP;
  top = clamp(top, 4, viewport.height - tip.height - 4);
  const left = clamp(
    target.left + target.width / 2 - tip.width / 2,
    VIEWPORT_MARGIN,
    viewport.width - tip.width - VIEWPORT_MARGIN,
  );
  return { top, left };
}

export type Align = "left" | "right";

export interface AnchoredPosition {
  top: number;
  left?: number;
  right?: number;
}

export function anchoredPosition(
  anchor: Box,
  align: Align,
  viewportWidth: number,
): AnchoredPosition {
  const top = anchor.top + anchor.height + MENU_GAP;
  if (align === "right")
    return { top, right: Math.max(8, viewportWidth - anchor.left - anchor.width) };
  return { top, left: Math.max(8, anchor.left) };
}
