import { describe, expect, test } from "bun:test";
import {
  ageSince,
  aspectRatio,
  captureTiles,
  channelsKey,
  fileName,
  fpsValue,
  joinPath,
  sampleRateLabel,
  videoCodecLabel,
} from "./format";

describe("video facts", () => {
  test("aspect ratio", () => {
    expect(aspectRatio(1920, 1080)).toBe("16:9");
    expect(aspectRatio(1280, 720)).toBe("16:9");
    expect(aspectRatio(1000, 563)).toBe("1.78:1");
    expect(aspectRatio(0, 10)).toBe("");
  });

  test("fps and codec labels", () => {
    expect(fpsValue(25)).toBe("25");
    expect(fpsValue(30000 / 1001)).toBe("29.97");
    expect(videoCodecLabel("h264")).toBe("H.264");
    expect(videoCodecLabel("mjpeg")).toBe("MJPEG");
    expect(sampleRateLabel(48000)).toBe("48 kHz");
    expect(sampleRateLabel(44100)).toBe("44.1 kHz");
    expect(channelsKey(1)).toBe("audio.mono");
    expect(channelsKey(2)).toBe("audio.stereo");
    expect(channelsKey(6)).toBeNull();
  });

  test("paths", () => {
    expect(fileName("C:\\videos\\a.mp4")).toBe("a.mp4");
    expect(fileName("/home/x/a.mp4")).toBe("a.mp4");
    expect(joinPath("/home/x/.framecue", "queue.jsonl")).toBe("/home/x/.framecue/queue.jsonl");
    expect(joinPath("C:\\v\\.framecue\\", "queue.jsonl")).toBe("C:\\v\\.framecue\\queue.jsonl");
  });
});

describe("ageSince", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");

  test("buckets", () => {
    expect(ageSince("2026-10-08T11:59:30Z", now)).toBeNull();
    expect(ageSince("2026-10-08T11:48:00Z", now)).toEqual({ unit: "minute", value: 12 });
    expect(ageSince("2026-10-08T09:00:00Z", now)).toEqual({ unit: "hour", value: 3 });
    expect(ageSince("2026-10-06T12:00:00Z", now)).toEqual({ unit: "day", value: 2 });
    expect(ageSince("nonsense", now)).toBeNull();
  });
});

describe("captureTiles", () => {
  test("range: In, Middle, Out, sheet in that order with frame numbers", () => {
    const tiles = captureTiles({
      frameStart: 10,
      frameEnd: 21,
      images: [
        "frames/a/sheet.png",
        "frames/a/last.png",
        "frames/a/first.png",
        "frames/a/middle.png",
      ],
    });
    expect(tiles.map((t) => [t.label, t.frame, t.sheet])).toEqual([
      ["cap.in", 10, false],
      ["cap.middle", 15, false],
      ["cap.out", 21, false],
      ["cap.sheet", null, true],
    ]);
  });

  test("single frame", () => {
    const tiles = captureTiles({
      frameStart: 7,
      frameEnd: 7,
      images: ["frames/a/frame.png"],
    });
    expect(tiles).toEqual([
      { image: "frames/a/frame.png", label: "cap.frame", frame: 7, sheet: false },
    ]);
  });

  test("no images", () => {
    expect(captureTiles({ frameStart: 0, frameEnd: 0, images: [] })).toEqual([]);
  });
});
