import { describe, expect, test } from "bun:test";
import type { Item, ItemStatus } from "../core/types";
import { nextToVerify, verifyCount } from "./verify";

function item(id: string, status: ItemStatus, withAfter: boolean): Item {
  return {
    id,
    video: { path: "x.mp4", sha256: "0" },
    fps: 25,
    kind: "frame",
    frameStart: 1,
    frameEnd: 1,
    timecode: "00:00:00:01",
    comment: "",
    priority: 0,
    status,
    images: [],
    after: withAfter ? { sha256: "1", capturedAt: "2026-01-01T00:00:00.000Z", images: [] } : null,
    agentNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const list = [
  item("a", "fixed", true),
  item("b", "todo", true),
  item("c", "fixed", false),
  item("d", "fixed", true),
  item("e", "verified", true),
];

describe("verification queue", () => {
  test("counts fixed items that have an after", () => {
    expect(verifyCount(list)).toBe(2);
    expect(verifyCount([])).toBe(0);
  });

  test("next item follows the queue order and wraps", () => {
    expect(nextToVerify(list, "a")?.id).toBe("d");
    expect(nextToVerify(list, "d")?.id).toBe("a");
    expect(nextToVerify(list, "e")?.id).toBe("a");
  });

  test("none left when the current one was the last", () => {
    const done = list.map((it) =>
      it.id === "a" || it.id === "d" ? { ...it, status: "verified" as const } : it,
    );
    expect(nextToVerify(done, "d")).toBeNull();
  });

  test("an item without after is never offered", () => {
    expect(nextToVerify([item("a", "fixed", false), item("b", "fixed", false)], "a")).toBeNull();
  });
});
