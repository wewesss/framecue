import { matcher, P } from "matchigo";

export type Action =
  | "toggle"
  | "prev"
  | "next"
  | "back10"
  | "forward10"
  | "first"
  | "last"
  | "setIn"
  | "setOut"
  | "region"
  | "add"
  | "clear"
  | "help"
  | "zoomIn"
  | "zoomOut"
  | "fit"
  | "snap"
  | "verify"
  | "reopen"
  | "copy";

export interface KeyInput {
  key: string;
  shift: boolean;
  alt: boolean;
  mod: boolean;
}

const resolve = matcher<KeyInput, Action | null>()
  .with({ mod: true }, () => null)
  .with({ alt: true }, () => null)
  .with({ key: "C", shift: true }, () => "copy")
  .with({ key: " " }, () => "toggle")
  .with({ key: "ArrowLeft", shift: true }, () => "back10")
  .with({ key: "ArrowRight", shift: true }, () => "forward10")
  .with({ key: "," }, () => "prev")
  .with({ key: "." }, () => "next")
  .with({ key: "Home" }, () => "first")
  .with({ key: "End" }, () => "last")
  .with({ key: P.union("i", "I") }, () => "setIn")
  .with({ key: P.union("o", "O") }, () => "setOut")
  .with({ key: P.union("r", "R") }, () => "region")
  .with({ key: "Enter" }, () => "add")
  .with({ key: "Escape" }, () => "clear")
  .with({ key: "?" }, () => "help")
  .with({ key: P.union("+", "=") }, () => "zoomIn")
  .with({ key: P.union("-", "_") }, () => "zoomOut")
  .with({ key: P.union("z", "Z"), shift: true }, () => "fit")
  .with({ key: P.union("s", "S") }, () => "snap")
  .with({ key: P.union("v", "V") }, () => "verify")
  .with({ key: P.union("x", "X") }, () => "reopen")
  .otherwise(() => null);

export function shortcutAction(input: KeyInput): Action | null {
  return resolve(input);
}
