import { describe, expect, test } from "bun:test";
import type { Item } from "../core/types";
import { agentFixedItems } from "./agent";

const base: Omit<Item, "id" | "status"> = {
  video: { path: "v.mp4", sha256: "x" },
  fps: 25,
  kind: "frame",
  frameStart: 0,
  frameEnd: 0,
  timecode: "00:00:00:00",
  comment: "",
  priority: 0,
  images: [],
  agentNote: null,
  createdAt: "",
  updatedAt: "",
};

const item = (id: string, over: Partial<Item>): Item => ({ ...base, id, status: "todo", ...over });

describe("agentFixedItems", () => {
  test("reports items that became fixed with an agent note", () => {
    const prev = [item("a", {}), item("b", {}), item("c", { status: "fixed", agentNote: "n" })];
    const next = [
      item("a", { status: "fixed", agentNote: "done" }),
      item("b", { status: "fixed" }),
      item("c", { status: "fixed", agentNote: "n" }),
      item("d", { status: "fixed", agentNote: "new" }),
    ];
    expect(agentFixedItems(prev, next).map((it) => it.id)).toEqual(["a"]);
  });
});
