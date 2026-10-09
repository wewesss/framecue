import { compile, P } from "matchigo";

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

const resolve = compile<KeyInput, Action | null>([
  { with: { mod: true }, then: null },
  { with: { alt: true }, then: null },
  { with: { key: "C", shift: true }, then: "copy" },
  { with: { key: " " }, then: "toggle" },
  { with: { key: "ArrowLeft", shift: true }, then: "back10" },
  { with: { key: "ArrowRight", shift: true }, then: "forward10" },
  { with: { key: "," }, then: "prev" },
  { with: { key: "." }, then: "next" },
  { with: { key: "Home" }, then: "first" },
  { with: { key: "End" }, then: "last" },
  { with: { key: P.union("i", "I") }, then: "setIn" },
  { with: { key: P.union("o", "O") }, then: "setOut" },
  { with: { key: P.union("r", "R") }, then: "region" },
  { with: { key: "Enter" }, then: "add" },
  { with: { key: "Escape" }, then: "clear" },
  { with: { key: "?" }, then: "help" },
  { with: { key: P.union("+", "=") }, then: "zoomIn" },
  { with: { key: P.union("-", "_") }, then: "zoomOut" },
  { with: { key: P.union("z", "Z"), shift: true }, then: "fit" },
  { with: { key: P.union("s", "S") }, then: "snap" },
  { with: { key: P.union("v", "V") }, then: "verify" },
  { with: { key: P.union("x", "X") }, then: "reopen" },
  { otherwise: null },
]);

export function shortcutAction(input: KeyInput): Action | null {
  return resolve(input);
}
