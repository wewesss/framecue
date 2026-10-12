import { describe, expect, test } from "bun:test";
import { clampLevel, DEFAULT_VOLUME, parseVolume } from "./volume";

describe("volume persistence", () => {
  test("defaults to full volume, unmuted", () => {
    expect(parseVolume(null)).toEqual(DEFAULT_VOLUME);
    expect(parseVolume(undefined)).toEqual(DEFAULT_VOLUME);
    expect(parseVolume("")).toEqual(DEFAULT_VOLUME);
    expect(parseVolume("garbage")).toEqual(DEFAULT_VOLUME);
    expect(parseVolume("null")).toEqual(DEFAULT_VOLUME);
  });

  test("reads a stored level and mute flag", () => {
    expect(parseVolume('{"level":0.4,"muted":true}')).toEqual({ level: 0.4, muted: true });
    expect(parseVolume('{"level":0.4}')).toEqual({ level: 0.4, muted: false });
    expect(parseVolume('{"muted":true}')).toEqual({ level: 1, muted: true });
  });

  test("clamps the level to 0..1", () => {
    expect(clampLevel(2)).toBe(1);
    expect(clampLevel(-1)).toBe(0);
    expect(clampLevel(Number.NaN)).toBe(1);
    expect(parseVolume('{"level":9}').level).toBe(1);
  });
});
