import { describe, expect, test } from "bun:test";
import { LANE_PITCH, laneOffset, MARKERS_H, markersContentHeight, markersHeight } from "./layout";
import { assignLanes, type TrackSpan } from "./tracks";

const span = (id: string, start: number, end = start): TrackSpan => ({ id, start, end });

function laneOf(spans: TrackSpan[]): Record<string, number> {
  return Object.fromEntries(assignLanes(spans).lanes);
}

describe("assignLanes", () => {
  test("no item gives one empty lane", () => {
    const layout = assignLanes([]);
    expect(layout.count).toBe(1);
    expect(layout.lanes.size).toBe(0);
  });

  test("disjoint items share lane 0", () => {
    expect(laneOf([span("a", 0, 10), span("b", 11, 20), span("c", 30)])).toEqual({
      a: 0,
      b: 0,
      c: 0,
    });
    expect(assignLanes([span("a", 0, 10), span("b", 11, 20)]).count).toBe(1);
  });

  test("overlapping items go to the lowest free lane", () => {
    const layout = assignLanes([span("a", 0, 100), span("b", 10, 20), span("c", 30, 40)]);
    expect(Object.fromEntries(layout.lanes)).toEqual({ a: 0, b: 1, c: 1 });
    expect(layout.count).toBe(2);
  });

  test("a nested range stacks above its parent, deeper nesting keeps climbing", () => {
    const layout = assignLanes([span("a", 0, 100), span("b", 10, 90), span("c", 20, 80)]);
    expect(Object.fromEntries(layout.lanes)).toEqual({ a: 0, b: 1, c: 2 });
    expect(layout.count).toBe(3);
  });

  test("ranges sharing a boundary frame overlap, adjacent ones do not", () => {
    expect(laneOf([span("a", 0, 10), span("b", 10, 20)])).toEqual({ a: 0, b: 1 });
    expect(laneOf([span("a", 0, 10), span("b", 11, 20)])).toEqual({ a: 0, b: 0 });
  });

  test("a single-frame item occupies its frame", () => {
    expect(laneOf([span("a", 5), span("b", 5)])).toEqual({ a: 0, b: 1 });
    expect(laneOf([span("a", 5), span("b", 6)])).toEqual({ a: 0, b: 0 });
    expect(laneOf([span("a", 0, 10), span("b", 10)])).toEqual({ a: 0, b: 1 });
    expect(laneOf([span("a", 0, 10), span("b", 11)])).toEqual({ a: 0, b: 0 });
  });

  test("a freed lane is reused by a later item", () => {
    const layout = assignLanes([
      span("a", 0, 50),
      span("b", 10, 20),
      span("c", 15, 25),
      span("d", 30, 40),
      span("e", 35, 60),
    ]);
    expect(Object.fromEntries(layout.lanes)).toEqual({ a: 0, b: 1, c: 2, d: 1, e: 2 });
    expect(layout.count).toBe(3);
  });

  test("input order does not change the result, ties keep input order", () => {
    const spans = [span("c", 20, 80), span("a", 0, 100), span("b", 10, 90)];
    expect(laneOf(spans)).toEqual({ a: 0, b: 1, c: 2 });
    expect(laneOf([span("x", 3, 9), span("y", 3, 9)])).toEqual({ x: 0, y: 1 });
    expect(laneOf([span("y", 3, 9), span("x", 3, 9)])).toEqual({ y: 0, x: 1 });
  });

  test("a reversed span is treated as a single frame at its start", () => {
    expect(laneOf([span("a", 10, 4), span("b", 11)])).toEqual({ a: 0, b: 0 });
  });

  test("no two items of a lane overlap", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const spans = Array.from({ length: 60 }, (_, i) => {
      const start = Math.floor(rand() * 200);
      return span(`i${i}`, start, start + Math.floor(rand() * 40));
    });
    const { lanes, count } = assignLanes(spans);
    const byLane = new Map<number, TrackSpan[]>();
    for (const s of spans) {
      const lane = lanes.get(s.id) as number;
      byLane.set(lane, [...(byLane.get(lane) ?? []), s]);
    }
    expect(byLane.size).toBe(count);
    for (const members of byLane.values()) {
      const sorted = [...members].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect((sorted[i] as TrackSpan).start).toBeGreaterThan((sorted[i - 1] as TrackSpan).end);
      }
    }
  });
});

describe("markers band layout", () => {
  test("one lane keeps the original height", () => {
    expect(markersHeight(1)).toBe(MARKERS_H);
    expect(markersContentHeight(1)).toBe(MARKERS_H);
    expect(laneOffset(0, 1)).toBe(0);
  });

  test("lanes stack upward from the clip", () => {
    expect(laneOffset(0, 3)).toBe(2 * LANE_PITCH);
    expect(laneOffset(2, 3)).toBe(0);
    expect(markersContentHeight(3)).toBe(MARKERS_H + 2 * LANE_PITCH);
  });

  test("the visible height grows then stops while the content keeps growing", () => {
    expect(markersHeight(2)).toBe(MARKERS_H + LANE_PITCH);
    expect(markersHeight(4)).toBe(markersHeight(9));
    expect(markersContentHeight(9)).toBeGreaterThan(markersHeight(9));
  });
});
