import { describe, expect, test } from "bun:test";
import { formatClock, frameToSeconds, frameToTimecode, secondsToFrame } from "./timecode";

describe("timecode", () => {
  test("frameToTimecode", () => {
    expect(frameToTimecode(0, 25)).toBe("00:00:00:00");
    expect(frameToTimecode(25, 25)).toBe("00:00:01:00");
    expect(frameToTimecode(1799, 30000 / 1001)).toBe("00:00:59:29");
    expect(frameToTimecode(1500, 25)).toBe("00:01:00:00");
  });

  test("roundtrip", () => {
    for (const fps of [25, 30000 / 1001, 60]) {
      for (const n of [0, 1, 17, 1799, 12345]) {
        expect(secondsToFrame(frameToSeconds(n, fps), fps)).toBe(n);
      }
    }
  });

  test("formatClock", () => {
    expect(formatClock(0)).toBe("0:00.000");
    expect(formatClock(52.5)).toBe("0:52.500");
    expect(formatClock(125.04)).toBe("2:05.040");
  });
});
