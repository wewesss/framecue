import { describe, expect, test } from "bun:test";
import { frameToSeekTime, itemTimecode, reconcileShown, stepTarget, timeToFrame } from "./frame";
import { moveItem } from "./order";
import { shortcutAction } from "./shortcuts";

const FPS_2997 = 30000 / 1001;

describe("timeToFrame", () => {
  test("25 fps boundaries", () => {
    expect(timeToFrame(0, 25)).toBe(0);
    expect(timeToFrame(0.039, 25)).toBe(0);
    expect(timeToFrame(0.04, 25)).toBe(1);
    expect(timeToFrame(1, 25)).toBe(25);
    expect(timeToFrame(3.96, 25)).toBe(99);
  });

  test("29.97 fps boundaries", () => {
    expect(timeToFrame(0, FPS_2997)).toBe(0);
    expect(timeToFrame(1001 / 30000, FPS_2997)).toBe(1);
    expect(timeToFrame((1001 / 30000) * 100, FPS_2997)).toBe(100);
    expect(timeToFrame((1001 / 30000) * 100 - 0.001, FPS_2997)).toBe(99);
  });
});

describe("frameToSeekTime", () => {
  test("lands in the middle of the frame", () => {
    expect(frameToSeekTime(0, 25)).toBeCloseTo(0.02, 10);
    expect(frameToSeekTime(10, 25)).toBeCloseTo(0.42, 10);
  });

  test("round-trips through timeToFrame for frames 0..200 at 29.97", () => {
    for (let f = 0; f <= 200; f++) {
      expect(timeToFrame(frameToSeekTime(f, FPS_2997), FPS_2997)).toBe(f);
    }
  });
});

describe("moveItem", () => {
  test("moves down and up to the target index", () => {
    expect(moveItem(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });

  test("unknown ids leave the order untouched", () => {
    expect(moveItem(["a", "b"], "a", "z")).toEqual(["a", "b"]);
  });
});

describe("shortcutAction", () => {
  const key = (k: string, extra = {}) => ({
    key: k,
    shift: false,
    alt: false,
    mod: false,
    ...extra,
  });

  test("maps the design shortcuts", () => {
    expect(shortcutAction(key(" "))).toBe("toggle");
    expect(shortcutAction(key(","))).toBe("prev");
    expect(shortcutAction(key("."))).toBe("next");
    expect(shortcutAction(key("ArrowLeft", { shift: true }))).toBe("back10");
    expect(shortcutAction(key("ArrowRight", { shift: true }))).toBe("forward10");
    expect(shortcutAction(key("i"))).toBe("setIn");
    expect(shortcutAction(key("O"))).toBe("setOut");
    expect(shortcutAction(key("Escape"))).toBe("clear");
  });

  test("verification shortcuts", () => {
    expect(shortcutAction(key("v"))).toBe("verify");
    expect(shortcutAction(key("V"))).toBe("verify");
    expect(shortcutAction(key("x"))).toBe("reopen");
    expect(shortcutAction(key("v", { mod: true }))).toBeNull();
  });

  test("plain arrows belong to the navigation layer", () => {
    expect(shortcutAction(key("ArrowLeft"))).toBeNull();
    expect(shortcutAction(key("ArrowRight"))).toBeNull();
  });

  test("timeline shortcuts", () => {
    expect(shortcutAction(key("+"))).toBe("zoomIn");
    expect(shortcutAction(key("="))).toBe("zoomIn");
    expect(shortcutAction(key("-"))).toBe("zoomOut");
    expect(shortcutAction(key("_"))).toBe("zoomOut");
    expect(shortcutAction(key("Z", { shift: true }))).toBe("fit");
    expect(shortcutAction(key("z"))).toBeNull();
    expect(shortcutAction(key("s"))).toBe("snap");
    expect(shortcutAction(key("S"))).toBe("snap");
  });

  test("ignores modified keys", () => {
    expect(shortcutAction(key(",", { alt: true }))).toBeNull();
    expect(shortcutAction(key("r", { mod: true }))).toBeNull();
  });
});

describe("stepTarget", () => {
  test("steps from the displayed frame when nothing is pending", () => {
    expect(stepTarget(4, null, 1, 500)).toBe(5);
    expect(stepTarget(4, null, -10, 500)).toBe(0);
  });
  test("accumulates on the pending target", () => {
    let pending: number | null = null;
    const shown = 0;
    for (let i = 0; i < 5; i++) pending = stepTarget(shown, pending, 1, 500);
    expect(pending).toBe(5);
  });
  test("clamps to the last frame", () => {
    expect(stepTarget(498, 499, 10, 500)).toBe(499);
  });
});

describe("reconcileShown", () => {
  test("adopts any frame when nothing is pending", () => {
    expect(reconcileShown(null, 7)).toEqual({ pending: null, adopt: true });
  });
  test("ignores stale frames while a seek is pending", () => {
    expect(reconcileShown(5, 3)).toEqual({ pending: 5, adopt: false });
  });
  test("settles when the pending frame is shown", () => {
    expect(reconcileShown(5, 5)).toEqual({ pending: null, adopt: true });
  });
});

describe("itemTimecode", () => {
  test("uses the item own fps, not the current video one", () => {
    expect(itemTimecode({ fps: 25 }, 120)).toBe("00:00:04:20");
    expect(itemTimecode({ fps: 30 }, 120)).toBe("00:00:04:00");
    expect(itemTimecode({ fps: 29.97 }, 1800)).toBe("00:01:00:00");
  });
});
