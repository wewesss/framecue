import { describe, expect, test } from "bun:test";
import {
  activePreset,
  canPan,
  clampPan,
  fitScale,
  MAX_SCALE,
  NO_PAN,
  percent,
  pictureRect,
  presetScale,
  wheelScale,
  zoomAtPoint,
} from "./geometry";
import { drawRegion, isUsable, MIN_REGION, moveRegion, regionPixels, resizeRegion } from "./region";

const video = { width: 1920, height: 1080 };
const box = { w: 1080, h: 664 };

describe("stage fit", () => {
  test("picture leaves 48 px sideways and 64 px vertically", () => {
    const scale = fitScale(box, video);
    expect(scale).toBeCloseTo(Math.min(1032 / 1920, 600 / 1080));
    const rect = pictureRect(box, video, scale, NO_PAN);
    expect(rect.x + rect.w / 2).toBeCloseTo(box.w / 2);
    expect(rect.y + rect.h / 2).toBeCloseTo(box.h / 2);
    expect(rect.w / rect.h).toBeCloseTo(16 / 9);
  });

  test("never collapses to zero", () => {
    expect(fitScale({ w: 10, h: 10 }, video)).toBeGreaterThan(0);
  });

  test("hud shows a rounded percent", () => {
    expect(percent(0.4737)).toBe(47);
    expect(percent(2)).toBe(200);
  });
});

describe("stage zoom", () => {
  const fit = fitScale(box, video);

  test("presets map to scales and back", () => {
    expect(presetScale("fit", fit)).toBe(fit);
    expect(presetScale("100", fit)).toBe(1);
    expect(presetScale("200", fit)).toBe(2);
    expect(activePreset(fit, fit)).toBe("fit");
    expect(activePreset(1, fit)).toBe("100");
    expect(activePreset(2, fit)).toBe("200");
    expect(activePreset(1.5, fit)).toBeNull();
  });

  test("wheel zoom stays between fit and the maximum", () => {
    expect(wheelScale(fit, 500, fit)).toBe(fit);
    expect(wheelScale(MAX_SCALE, -500, fit)).toBe(MAX_SCALE);
    expect(wheelScale(1, -100, fit)).toBeGreaterThan(1);
  });

  test("zoom around a point keeps that point still", () => {
    const point = { x: 100, y: -40 };
    const pan = zoomAtPoint(1, 2, NO_PAN, point);
    const before = { x: point.x, y: point.y };
    const worldBefore = { x: (before.x - 0) / 1, y: (before.y - 0) / 1 };
    const worldAfter = { x: (point.x - pan.x) / 2, y: (point.y - pan.y) / 2 };
    expect(worldAfter).toEqual(worldBefore);
  });

  test("pan is locked when the picture fits", () => {
    expect(canPan(box, video, fit)).toBe(false);
    expect(clampPan({ x: 300, y: 300 }, box, video, fit)).toEqual({ x: 0, y: 0 });
  });

  test("pan is limited when zoomed", () => {
    expect(canPan(box, video, 1)).toBe(true);
    const limited = clampPan({ x: 99999, y: -99999 }, box, video, 1);
    expect(limited.x).toBe((1920 - box.w) / 2 + 24);
    expect(limited.y).toBe(-((1080 - box.h) / 2 + 32));
  });
});

describe("region geometry", () => {
  const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.3 };

  test("drawing orders and clamps the corners", () => {
    expect(drawRegion({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })).toEqual({
      x: 0.2,
      y: 0.1,
      w: 0.6 - 0.2,
      h: 0.5 - 0.1,
    });
    const clamped = drawRegion({ x: 0.5, y: 0.5 }, { x: 1.4, y: -0.3 });
    expect(clamped.x).toBe(0.5);
    expect(clamped.w).toBe(0.5);
    expect(clamped.y).toBe(0);
    expect(clamped.h).toBe(0.5);
  });

  test("moving keeps the size and stays inside", () => {
    const moved = moveRegion(start, 0.1, 0.1);
    expect(moved.x).toBeCloseTo(0.3);
    expect(moved.y).toBeCloseTo(0.3);
    expect(moved.w).toBe(0.4);
    expect(moveRegion(start, 5, 5)).toEqual({ x: 0.6, y: 0.7, w: 0.4, h: 0.3 });
    expect(moveRegion(start, -5, -5)).toEqual({ x: 0, y: 0, w: 0.4, h: 0.3 });
  });

  test("resizing moves the matching edges", () => {
    const east = resizeRegion(start, "e", 0.1, 0.4);
    expect(east.x).toBeCloseTo(0.2);
    expect(east.w).toBeCloseTo(0.5);
    expect(east.h).toBeCloseTo(0.3);
    const northWest = resizeRegion(start, "nw", -0.1, -0.1);
    expect(northWest.x).toBeCloseTo(0.1);
    expect(northWest.y).toBeCloseTo(0.1);
    expect(northWest.w).toBeCloseTo(0.5);
    expect(northWest.h).toBeCloseTo(0.4);
  });

  test("dragging a handle across the opposite edge flips the rectangle", () => {
    const flipped = resizeRegion(start, "e", -0.5, 0);
    expect(flipped.x).toBeCloseTo(0.1);
    expect(flipped.w).toBeCloseTo(0.1);
  });

  test("tiny rectangles are rejected", () => {
    expect(isUsable({ x: 0, y: 0, w: MIN_REGION, h: MIN_REGION })).toBe(true);
    expect(isUsable({ x: 0, y: 0, w: 0.001, h: 0.5 })).toBe(false);
  });

  test("label size is in source pixels", () => {
    expect(regionPixels({ x: 0, y: 0, w: 0.46, h: 0.195 }, 1920, 1080)).toEqual({
      w: 883,
      h: 211,
    });
  });
});
