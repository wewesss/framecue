import { describe, expect, test } from "bun:test";
import {
  applyOrder,
  autoScrollSpeed,
  clampOffset,
  mapFilteredToFull,
  siblingShift,
  targetIndex,
} from "./sortable";

const slots = [0, 1, 2, 3].map((i) => ({ top: i * 50, height: 50 }));

describe("targetIndex", () => {
  test("picks the slot under the centre", () => {
    expect(targetIndex(10, slots)).toBe(0);
    expect(targetIndex(75, slots)).toBe(1);
    expect(targetIndex(199, slots)).toBe(3);
  });
  test("clamps outside the list", () => {
    expect(targetIndex(-30, slots)).toBe(0);
    expect(targetIndex(900, slots)).toBe(3);
    expect(targetIndex(5, [])).toBe(0);
  });
});

describe("siblingShift", () => {
  test("moving down shifts rows between up", () => {
    expect([0, 1, 2, 3].map((i) => siblingShift(i, 0, 2, 50))).toEqual([0, -50, -50, 0]);
  });
  test("moving up shifts rows between down", () => {
    expect([0, 1, 2, 3].map((i) => siblingShift(i, 3, 1, 50))).toEqual([0, 50, 50, 0]);
  });
  test("no move, no shift", () => {
    expect([0, 1, 2].map((i) => siblingShift(i, 1, 1, 50))).toEqual([0, 0, 0]);
  });
});

describe("clampOffset", () => {
  test("keeps the item inside the bounds", () => {
    expect(clampOffset(-500, 50, 40, 0, 200)).toBe(-50);
    expect(clampOffset(500, 50, 40, 0, 200)).toBe(110);
    expect(clampOffset(20, 50, 40, 0, 200)).toBe(20);
  });
});

describe("autoScrollSpeed", () => {
  test("zero in the middle", () => {
    expect(autoScrollSpeed(200, 0, 400)).toBe(0);
  });
  test("proportional near the edges", () => {
    expect(autoScrollSpeed(28, 0, 400)).toBe(-8);
    expect(autoScrollSpeed(372, 0, 400)).toBe(8);
  });
  test("capped past the edges", () => {
    expect(autoScrollSpeed(-100, 0, 400)).toBe(-16);
    expect(autoScrollSpeed(900, 0, 400)).toBe(16);
  });
});

describe("mapFilteredToFull", () => {
  const full = ["a", "b", "c", "d", "e", "f"];
  test("unfiltered view behaves like a plain move", () => {
    expect(mapFilteredToFull(full, full, "a", 2)).toEqual(["b", "c", "a", "d", "e", "f"]);
    expect(mapFilteredToFull(full, full, "e", 1)).toEqual(["a", "e", "b", "c", "d", "f"]);
  });
  test("moving down lands right after the visible neighbour", () => {
    expect(mapFilteredToFull(full, ["a", "c", "e"], "a", 1)).toEqual([
      "b",
      "c",
      "a",
      "d",
      "e",
      "f",
    ]);
    expect(mapFilteredToFull(full, ["a", "c", "e"], "a", 2)).toEqual([
      "b",
      "c",
      "d",
      "e",
      "a",
      "f",
    ]);
  });
  test("moving up lands right before the visible neighbour", () => {
    expect(mapFilteredToFull(full, ["a", "c", "e"], "e", 1)).toEqual([
      "a",
      "b",
      "e",
      "c",
      "d",
      "f",
    ]);
    expect(mapFilteredToFull(full, ["a", "c", "e"], "e", 0)).toEqual([
      "e",
      "a",
      "b",
      "c",
      "d",
      "f",
    ]);
  });
  test("same slot or unknown id changes nothing", () => {
    expect(mapFilteredToFull(full, ["a", "c"], "a", 0)).toEqual(full);
    expect(mapFilteredToFull(full, ["a", "c"], "z", 1)).toEqual(full);
  });
});

describe("applyOrder", () => {
  test("reassigns priorities and keeps unlisted items last", () => {
    const items = [
      { id: "a", priority: 0 },
      { id: "b", priority: 1 },
      { id: "c", priority: 2 },
    ];
    expect(applyOrder(items, ["c", "a"])).toEqual([
      { id: "c", priority: 0 },
      { id: "a", priority: 1 },
      { id: "b", priority: 2 },
    ]);
  });
});
