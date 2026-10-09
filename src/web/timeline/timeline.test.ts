import { describe, expect, test } from "bun:test";
import { clampHeight, defaultHeight, lanes, maxHeight } from "./layout";
import { bucketsPerPixel, resamplePeaks } from "./peaks";
import { moveBracket, rangeFrom, SNAP_PX, snapFrame, snapTargets } from "./snap";
import { divLabel, rulerSteps, rulerTicks, tickText } from "./ticks";
import {
  atMaxZoom,
  FIT_VIEW,
  followPlayhead,
  formatFactor,
  isFit,
  longPressView,
  makeView,
  minSpan,
  wheelFactor,
  zoomAround,
  zoomFactor,
} from "./zoom";

describe("ruler steps at 25 fps", () => {
  test("whole 3750 frame clip over 1000 px", () => {
    const steps = rulerSteps(1000 / 3750, 25);
    expect(steps).toEqual({ label: 750, mid: 125, minor: 25 });
  });

  test("deep zoom shows single frames", () => {
    const steps = rulerSteps(24, 25);
    expect(steps.label).toBe(5);
    expect(steps.minor).toBe(1);
  });

  test("label needs 70 px, mid 16 px, minor 5 px", () => {
    expect(rulerSteps(7, 25)).toEqual({ label: 10, mid: 5, minor: 1 });
    expect(rulerSteps(1.4, 25)).toEqual({ label: 50, mid: 25, minor: 5 });
    expect(rulerSteps(0.5, 25)).toEqual({ label: 250, mid: 50, minor: 25 });
  });

  test("minor and mid divide the label step", () => {
    for (const ppf of [0.05, 0.1, 0.3, 0.8, 2, 5, 12, 24]) {
      const { label, mid, minor } = rulerSteps(ppf, 25);
      expect(label % minor).toBe(0);
      if (mid) expect(label % mid).toBe(0);
    }
  });

  test("other frame rates use their own second", () => {
    expect(rulerSteps(1000 / 3000, 30).label).toBe(300);
    expect(rulerSteps(1, 24).label).toBe(120);
  });
});

describe("ruler ticks and labels", () => {
  test("ticks are placed on the view", () => {
    const steps = rulerSteps(1000 / 500, 25);
    const ticks = rulerTicks(0, 500, 1000, steps, 25);
    expect(ticks[0]?.frame).toBe(0);
    expect(ticks.every((tick) => tick.x >= -1 && tick.x <= 1001)).toBe(true);
    expect(ticks.filter((tick) => tick.level === "major").every((t) => t.text !== null)).toBe(true);
  });

  test("labels at one second or more are mm:ss", () => {
    expect(tickText(1250, 250, 25)).toEqual({ text: "00:50", second: false });
  });

  test("labels under a second show frames, whole seconds mm:ss:ff", () => {
    expect(tickText(7, 5, 25)).toEqual({ text: "7", second: false });
    expect(tickText(50, 5, 25)).toEqual({ text: "00:02:00", second: true });
  });

  test("division label units", () => {
    expect(divLabel(5, 25)).toEqual({ unit: "frames", value: 5 });
    expect(divLabel(25, 25)).toEqual({ unit: "seconds", value: 1 });
    expect(divLabel(750, 25)).toEqual({ unit: "seconds", value: 30 });
    expect(divLabel(1500, 25)).toEqual({ unit: "minutes", value: 1 });
  });
});

describe("zoom math", () => {
  const count = 3750;
  const width = 1000;

  test("fit view spans the whole clip", () => {
    const view = makeView(FIT_VIEW, count, width);
    expect(view).toEqual({ v0: 0, v1: count });
    expect(isFit(view, count)).toBe(true);
    expect(zoomFactor(view, count)).toBe(1);
  });

  test("span is limited to 24 px per frame and at least 4 frames", () => {
    expect(minSpan(count, 1000)).toBeCloseTo(1000 / 24);
    expect(minSpan(count, 60)).toBe(4);
    const deep = makeView({ v0: 10, span: 1 }, count, width);
    expect(atMaxZoom(deep, width)).toBe(true);
  });

  test("view stays inside the clip", () => {
    expect(makeView({ v0: -50, span: 500 }, count, width).v0).toBe(0);
    const end = makeView({ v0: 99999, span: 500 }, count, width);
    expect(end.v1).toBe(count);
  });

  test("zoom keeps the anchor under the pointer", () => {
    const view = makeView({ v0: 1000, span: 800 }, count, width);
    const anchor = 1200;
    const ratio = (anchor - view.v0) / (view.v1 - view.v0);
    const next = makeView(zoomAround(view, 2, anchor, count, width), count, width);
    expect((anchor - next.v0) / (next.v1 - next.v0)).toBeCloseTo(ratio);
    expect(next.v1 - next.v0).toBeCloseTo(400);
  });

  test("zooming out at fit stays at fit", () => {
    const fit = makeView(FIT_VIEW, count, width);
    const out = makeView(zoomAround(fit, 1 / 1.6, 100, count, width), count, width);
    expect(out).toEqual(fit);
  });

  test("wheel factor is exponential", () => {
    expect(wheelFactor(0)).toBe(1);
    expect(wheelFactor(-100)).toBeCloseTo(Math.exp(0.22));
    expect(wheelFactor(100)).toBeCloseTo(1 / wheelFactor(-100));
  });

  test("follow playhead recentres, or puts it at 5 % while playing", () => {
    const view = makeView({ v0: 1000, span: 400 }, count, width);
    expect(followPlayhead(view, 1100, false, count)).toBeNull();
    expect(followPlayhead(view, 2000, false, count)).toEqual({ v0: 1800, span: 400 });
    expect(followPlayhead(view, 2000, true, count)).toEqual({ v0: 1980, span: 400 });
    expect(followPlayhead(makeView(FIT_VIEW, count, width), 2000, false, count)).toBeNull();
  });

  test("long press zoom is 14 px per frame around the pointer", () => {
    const raw = longPressView(500, 0.25, 1000);
    expect(raw.span).toBeCloseTo(1000 / 14);
    expect(raw.v0).toBeCloseTo(500 - 0.25 * raw.span);
  });

  test("factor formatting uses a decimal under 10", () => {
    expect(formatFactor(4.2, ",")).toBe("4,2");
    expect(formatFactor(1, ",")).toBe("1");
    expect(formatFactor(12.4, ",")).toBe("12");
    expect(formatFactor(4.2, ".")).toBe("4.2");
  });
});

describe("snapping", () => {
  const base = { ppf: 4, count: 3750, targets: [100, 300], minor: 5, enabled: true };

  test("disabled snapping gives the exact frame", () => {
    expect(snapFrame({ ...base, enabled: false, pos: 101.7 })).toEqual({
      frame: 101,
      hit: false,
      tick: false,
    });
  });

  test("targets win within 8 px", () => {
    expect(SNAP_PX).toBe(8);
    expect(snapFrame({ ...base, pos: 102 })).toEqual({ frame: 100, hit: true, tick: false });
    expect(snapFrame({ ...base, pos: 98.2 })).toEqual({ frame: 100, hit: true, tick: false });
  });

  test("beyond 8 px the grid rounds to the minor tick", () => {
    expect(snapFrame({ ...base, pos: 203.4 })).toEqual({ frame: 205, hit: true, tick: true });
    expect(snapFrame({ ...base, pos: 201.2 })).toEqual({ frame: 200, hit: true, tick: true });
  });

  test("one frame grid keeps the exact frame", () => {
    expect(snapFrame({ ...base, minor: 1, pos: 203.6 })).toEqual({
      frame: 203,
      hit: false,
      tick: false,
    });
  });

  test("result is clamped to the clip", () => {
    expect(snapFrame({ ...base, targets: [], minor: 25, pos: 4000 }).frame).toBe(3749);
    expect(snapFrame({ ...base, targets: [], minor: 25, pos: -30 }).frame).toBe(0);
  });

  test("targets leave out what is being dragged", () => {
    const sources = {
      items: [{ start: 10, end: 20 }],
      inFrame: 30,
      outFrame: 40,
      playhead: 50,
      count: 100,
    };
    expect(snapTargets({ ...sources, exclude: [] }).sort((a, b) => a - b)).toEqual([
      0, 10, 20, 30, 40, 50, 99,
    ]);
    expect(snapTargets({ ...sources, exclude: ["in", "out"] })).not.toContain(30);
    expect(snapTargets({ ...sources, exclude: ["playhead"] })).not.toContain(50);
  });
});

describe("brackets and ranges", () => {
  test("moving In past Out swaps them", () => {
    expect(moveBracket({ inFrame: 10, outFrame: 20 }, "in", 30)).toEqual({
      inFrame: 20,
      outFrame: 30,
    });
    expect(moveBracket({ inFrame: 10, outFrame: 20 }, "out", 5)).toEqual({
      inFrame: 5,
      outFrame: 10,
    });
  });

  test("moving inside keeps the order", () => {
    expect(moveBracket({ inFrame: 10, outFrame: 20 }, "in", 15)).toEqual({
      inFrame: 15,
      outFrame: 20,
    });
    expect(moveBracket({ inFrame: null, outFrame: 20 }, "in", 15)).toEqual({
      inFrame: 15,
      outFrame: 20,
    });
  });

  test("a drawn range is ordered", () => {
    expect(rangeFrom(40, 10)).toEqual({ inFrame: 10, outFrame: 40 });
    expect(rangeFrom(40, 90)).toEqual({ inFrame: 40, outFrame: 90 });
  });
});

describe("lane layout", () => {
  test("default heights", () => {
    expect(defaultHeight({ wave: true, audio: true })).toBe(136);
    expect(defaultHeight({ wave: true, audio: false })).toBe(112);
    expect(defaultHeight({ wave: false, audio: true })).toBe(96);
  });

  test("height is clamped between 64 and 45 % of the viewport", () => {
    expect(maxHeight(900)).toBe(405);
    expect(clampHeight(10, 900)).toBe(64);
    expect(clampHeight(999, 900)).toBe(405);
    expect(clampHeight(100, 100)).toBe(64);
  });

  test("audio and clip share the room", () => {
    expect(lanes(136, { wave: true, audio: true })).toEqual({ clipH: 32, audioH: 50 });
    expect(lanes(112, { wave: true, audio: false })).toEqual({ clipH: 34, audioH: 22 });
    expect(lanes(96, { wave: false, audio: true })).toEqual({ clipH: 45, audioH: 0 });
  });

  test("a lane that is too small is hidden", () => {
    expect(lanes(64, { wave: true, audio: true })).toEqual({ clipH: 13, audioH: 0 });
  });
});

describe("peak resampling", () => {
  const rate = 200;
  const fps = 25;
  const data = new Int8Array(2 * rate * 10);
  for (let i = 0; i < data.length / 2; i++) {
    data[i * 2] = -64;
    data[i * 2 + 1] = i < 200 ? 127 : 32;
  }

  test("zoomed out gives one min/max column per pixel", () => {
    const slice = resamplePeaks(data, rate, fps, 0, 250, 100);
    expect(slice.mode).toBe("columns");
    if (slice.mode !== "columns") return;
    expect(slice.max.length).toBe(100);
    expect(slice.max[0]).toBeCloseTo(1);
    expect(slice.max[99]).toBeCloseTo(32 / 127);
    expect(slice.min[0]).toBeCloseTo(-64 / 127);
    expect(slice.body[0] ?? 0).toBeGreaterThan(0);
  });

  test("deep zoom switches to a line", () => {
    const slice = resamplePeaks(data, rate, fps, 10, 14, 1000);
    expect(slice.mode).toBe("line");
    if (slice.mode !== "line") return;
    expect(slice.x.length).toBe(slice.y.length);
    expect(slice.x.length).toBeGreaterThan(0);
  });

  test("threshold is 1.5 buckets per pixel", () => {
    expect(bucketsPerPixel(200, 25, 0, 250, 100)).toBe(20);
    expect(resamplePeaks(data, rate, fps, 0, 250, 1600).mode).toBe("line");
  });

  test("columns past the end stay silent", () => {
    const slice = resamplePeaks(data, rate, fps, 200, 450, 100);
    if (slice.mode !== "columns") throw new Error("expected columns");
    expect(slice.max[99]).toBe(0);
  });
});
