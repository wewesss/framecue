import { compile, matcher } from "matchigo";
import type { ItemKind, ItemStatus } from "../core/types";
import type { TKey } from "./i18n/core";
import type { IconName } from "./ui/Icon";

export const STATUSES: ItemStatus[] = ["todo", "fixed", "verified", "reopened"];

export const statusIcon = matcher<ItemStatus, IconName>()
  .with("todo", "circle")
  .with("fixed", "wrench")
  .with("verified", "checkmark.circle")
  .with("reopened", "arrow.counterclockwise")
  .exhaustive();

export const statusLabelKey = matcher<ItemStatus, TKey>()
  .with("todo", "status.todo")
  .with("fixed", "status.fixed")
  .with("verified", "status.verified")
  .with("reopened", "status.reopened")
  .exhaustive();

export const statusDescKey = matcher<ItemStatus, TKey>()
  .with("todo", "status.todo.desc")
  .with("fixed", "status.fixed.desc")
  .with("verified", "status.verified.desc")
  .with("reopened", "status.reopened.desc")
  .exhaustive();

export const statusClass = matcher<ItemStatus, string>()
  .with("todo", "s-todo")
  .with("fixed", "s-fixed")
  .with("verified", "s-verified")
  .with("reopened", "s-reopened")
  .exhaustive();

export const markerStatusClass = matcher<ItemStatus, string>()
  .with("todo", "mk--todo")
  .with("fixed", "mk--fixed")
  .with("verified", "mk--verified")
  .with("reopened", "mk--reopened")
  .exhaustive();

export const kindIcon = matcher<ItemKind, IconName>()
  .with("frame", "photo")
  .with("range", "film")
  .with("region", "crop")
  .exhaustive();

interface KindRef {
  kind: ItemKind;
  isRange: boolean;
}

const kindLabel = compile<KindRef, TKey>([
  { with: { kind: "region", isRange: true }, then: "kind.regionOnRange" },
  { with: { kind: "region" }, then: "kind.regionOnFrame" },
  { with: { kind: "range" }, then: "kind.range" },
  { otherwise: "kind.frame" },
]);

export function kindLabelKey(kind: ItemKind, isRange: boolean): TKey {
  return kindLabel({ kind, isRange });
}
