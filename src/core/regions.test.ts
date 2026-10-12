import { describe, expect, test } from "bun:test";
import {
  normalizeRegions,
  REGION_COLORS,
  regionColor,
  regionDetails,
  regionPixelRect,
} from "./regions";

describe("region palette", () => {
  test("fixed order, then cycles", () => {
    expect(REGION_COLORS.map((c) => c.name)).toEqual([
      "blue",
      "red",
      "green",
      "orange",
      "purple",
      "cyan",
    ]);
    expect(regionColor(0).name).toBe("blue");
    expect(regionColor(5).name).toBe("cyan");
    expect(regionColor(6).name).toBe("blue");
    expect(regionColor(13).name).toBe("red");
  });
});

describe("regionDetails", () => {
  test("numbers from 1, names the colour, gives both rectangles", () => {
    const details = regionDetails(
      [
        { x: 0.25, y: 0.5, w: 0.5, h: 0.25 },
        { x: 0, y: 0, w: 1, h: 1 },
      ],
      { width: 1920, height: 1080 },
    );
    expect(details).toEqual([
      {
        number: 1,
        color: "blue",
        normalised: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 },
        pixels: { x: 480, y: 540, w: 960, h: 270 },
      },
      {
        number: 2,
        color: "red",
        normalised: { x: 0, y: 0, w: 1, h: 1 },
        pixels: { x: 0, y: 0, w: 1920, h: 1080 },
      },
    ]);
  });

  test("pixels are null when the size is unknown", () => {
    expect(regionDetails([{ x: 0, y: 0, w: 1, h: 1 }], { width: 0, height: 0 })[0]?.pixels).toBe(
      null,
    );
  });

  test("regionPixelRect rounds", () => {
    expect(regionPixelRect({ x: 0.333, y: 0.5, w: 0.46, h: 0.195 }, 1920, 1080)).toEqual({
      x: 639,
      y: 540,
      w: 883,
      h: 211,
    });
  });
});

describe("normalizeRegions", () => {
  const r = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };

  test("keeps the new field and drops junk entries", () => {
    expect(normalizeRegions({ regions: [r, null, { x: 1 }, r] })).toEqual([r, r]);
  });

  test("maps the legacy single region", () => {
    expect(normalizeRegions({ region: r })).toEqual([r]);
    expect(normalizeRegions({ region: null })).toEqual([]);
    expect(normalizeRegions({})).toEqual([]);
  });

  test("the new field wins over a legacy one", () => {
    expect(normalizeRegions({ regions: [], region: r })).toEqual([]);
  });
});
