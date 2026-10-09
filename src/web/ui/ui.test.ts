import { describe, expect, test } from "bun:test";
import { isNavKey, nextEnabled } from "./menuNav";
import { anchoredPosition, placeTip } from "./placement";
import {
  commitsOn,
  DRAG_THRESHOLD,
  dragOutcome,
  dragProgress,
  passedThreshold,
} from "./switchLogic";
import { clampWipe, wipeFromKey, wipeFromPointer } from "./wipe";

describe("switch drag logic", () => {
  test("threshold is 4 px either way", () => {
    expect(DRAG_THRESHOLD).toBe(4);
    expect(passedThreshold(100, 103)).toBe(false);
    expect(passedThreshold(100, 104)).toBe(true);
    expect(passedThreshold(100, 96)).toBe(true);
    expect(passedThreshold(100, 97)).toBe(false);
  });

  test("progress is clamped to the track", () => {
    expect(dragProgress(50, 0, 100, false)).toBe(0.5);
    expect(dragProgress(-10, 0, 100, false)).toBe(0);
    expect(dragProgress(500, 0, 100, false)).toBe(1);
    expect(dragProgress(10, 0, 0, true)).toBe(1);
    expect(dragProgress(10, 0, 0, false)).toBe(0);
  });

  test("commits to the side of 50 %", () => {
    expect(commitsOn(0.49)).toBe(false);
    expect(commitsOn(0.5)).toBe(true);
    expect(dragOutcome(0.8, false)).toBe(true);
    expect(dragOutcome(0.2, true)).toBe(false);
    expect(dragOutcome(0.8, true)).toBeNull();
    expect(dragOutcome(0.2, false)).toBeNull();
  });
});

describe("menu navigation", () => {
  const none = [false, false, false];

  test("arrows wrap around", () => {
    expect(nextEnabled(none, 0, "ArrowDown")).toBe(1);
    expect(nextEnabled(none, 2, "ArrowDown")).toBe(0);
    expect(nextEnabled(none, 0, "ArrowUp")).toBe(2);
  });

  test("starting from nothing selected", () => {
    expect(nextEnabled(none, -1, "ArrowDown")).toBe(0);
    expect(nextEnabled(none, -1, "ArrowUp")).toBe(2);
  });

  test("disabled entries are skipped", () => {
    const disabled = [false, true, false];
    expect(nextEnabled(disabled, 0, "ArrowDown")).toBe(2);
    expect(nextEnabled(disabled, 2, "ArrowUp")).toBe(0);
    expect(nextEnabled([true, false, true], 1, "ArrowDown")).toBe(1);
  });

  test("home and end pick the first and last enabled", () => {
    const disabled = [true, false, false, true];
    expect(nextEnabled(disabled, 2, "Home")).toBe(1);
    expect(nextEnabled(disabled, 1, "End")).toBe(2);
  });

  test("all disabled gives -1", () => {
    expect(nextEnabled([true, true], 0, "ArrowDown")).toBe(-1);
    expect(nextEnabled([], -1, "Home")).toBe(-1);
  });

  test("isNavKey", () => {
    expect(isNavKey("ArrowDown")).toBe(true);
    expect(isNavKey("Enter")).toBe(false);
  });
});

describe("placement", () => {
  const viewport = { width: 1000, height: 600 };

  test("tooltip sits 8 px above the target, centred", () => {
    const pos = placeTip(
      { top: 300, left: 400, width: 100, height: 28 },
      { width: 80, height: 20 },
      viewport,
    );
    expect(pos).toEqual({ top: 272, left: 410 });
  });

  test("tooltip goes below when it does not fit above", () => {
    const pos = placeTip(
      { top: 10, left: 400, width: 100, height: 28 },
      { width: 80, height: 20 },
      viewport,
    );
    expect(pos.top).toBe(46);
  });

  test("tooltip is clamped 6 px inside the viewport", () => {
    expect(
      placeTip({ top: 300, left: 0, width: 10, height: 20 }, { width: 80, height: 20 }, viewport)
        .left,
    ).toBe(6);
    expect(
      placeTip({ top: 300, left: 990, width: 10, height: 20 }, { width: 80, height: 20 }, viewport)
        .left,
    ).toBe(914);
  });

  test("menus open 6 px under the trigger", () => {
    const anchor = { top: 10, left: 300, width: 40, height: 28 };
    expect(anchoredPosition(anchor, "left", 1000)).toEqual({ top: 44, left: 300 });
    expect(anchoredPosition(anchor, "right", 1000)).toEqual({ top: 44, right: 660 });
  });
});

describe("wipe divider", () => {
  test("clamps to 0..100", () => {
    expect(clampWipe(-5)).toBe(0);
    expect(clampWipe(120)).toBe(100);
    expect(clampWipe(42)).toBe(42);
  });

  test("pointer maps to a percentage of the width", () => {
    expect(wipeFromPointer(150, 100, 200)).toBe(25);
    expect(wipeFromPointer(50, 100, 200)).toBe(0);
    expect(wipeFromPointer(900, 100, 200)).toBe(100);
    expect(wipeFromPointer(10, 0, 0)).toBe(50);
  });

  test("arrows move by 2 %, 10 % with shift", () => {
    expect(wipeFromKey("ArrowLeft", 50, false)).toBe(48);
    expect(wipeFromKey("ArrowRight", 50, false)).toBe(52);
    expect(wipeFromKey("ArrowRight", 50, true)).toBe(60);
    expect(wipeFromKey("ArrowLeft", 3, true)).toBe(0);
    expect(wipeFromKey("Home", 50, false)).toBe(0);
    expect(wipeFromKey("End", 50, false)).toBe(100);
    expect(wipeFromKey("a", 50, false)).toBeNull();
  });
});
