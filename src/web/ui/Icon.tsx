import type { SymbolData, SymbolName } from "@miralabs-tech/icones";
import {
  arrowCounterclockwise,
  arrowDownToLine,
  arrowUpLeftAndArrowDownRight,
  backwardEnd,
  checkmark,
  checkmarkCircle,
  chevronDown,
  chevronLeft,
  chevronLeft2,
  chevronRight,
  chevronRight2,
  circle,
  crop,
  docOnDoc,
  ellipsis,
  exclamationmarkTriangle,
  film,
  folder,
  forwardEnd,
  gearshape,
  handPointUp,
  keyboard,
  line3Horizontal,
  minusMagnifyingglass,
  moon,
  pause,
  photo,
  pin,
  play,
  plus,
  plusMagnifyingglass,
  point3ConnectedTrianglepathDotted,
  questionmarkCircle,
  robot,
  scope,
  speakerSlash,
  sunMax,
  trash,
  waveform,
  wrench,
  xmark,
} from "@miralabs-tech/icones";
import { symbolTree } from "@miralabs-tech/icones/render";
import classigo from "classigo/lite";
import { createElement, type ReactElement } from "react";

const registry = {
  play,
  pause,
  "backward.end": backwardEnd,
  "forward.end": forwardEnd,
  "chevron.left": chevronLeft,
  "chevron.right": chevronRight,
  "chevron.left.2": chevronLeft2,
  "chevron.right.2": chevronRight2,
  "chevron.down": chevronDown,
  "arrow.down.to.line": arrowDownToLine,
  crop,
  photo,
  film,
  plus,
  xmark,
  "questionmark.circle": questionmarkCircle,
  "sun.max": sunMax,
  moon,
  "exclamationmark.triangle": exclamationmarkTriangle,
  circle,
  wrench,
  "checkmark.circle": checkmarkCircle,
  "arrow.counterclockwise": arrowCounterclockwise,
  "line.3.horizontal": line3Horizontal,
  scope,
  ellipsis,
  "doc.on.doc": docOnDoc,
  trash,
  checkmark,
  robot,
  waveform,
  "speaker.slash": speakerSlash,
  "hand.point.up": handPointUp,
  "plus.magnifyingglass": plusMagnifyingglass,
  "minus.magnifyingglass": minusMagnifyingglass,
  "arrow.up.left.and.arrow.down.right": arrowUpLeftAndArrowDownRight,
  keyboard,
  folder,
  gearshape,
  pin,
  "point.3.connected.trianglepath.dotted": point3ConnectedTrianglepathDotted,
} satisfies Partial<Record<SymbolName, SymbolData>>;

export type IconName = keyof typeof registry;

export type IconSize = 10 | 12 | 13 | 14 | 15 | 16;

export interface IconProps {
  name: IconName;
  size?: IconSize;
  filled?: boolean;
  rotate?: number;
  className?: string;
}

type Node = ReturnType<typeof symbolTree>;

const trees = new Map<string, Node>();

function treeFor(name: IconName, filled: boolean, rotate: number): Node {
  const key = `${name}|${filled}|${rotate}`;
  const cached = trees.get(key);
  if (cached) return cached;
  const shape = filled ? "fill" : "outline";
  const tree = symbolTree(registry[name], {
    weight: "medium",
    shape,
    id: `fc-${name.replaceAll(".", "-")}-${shape}`,
  });
  const result: Node = rotate
    ? {
        ...tree,
        children: [
          { tag: "g", attrs: { transform: `rotate(${rotate} 12 12)` }, children: tree.children },
        ],
      }
    : tree;
  trees.set(key, result);
  return result;
}

const camel = (key: string) => key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function toElement(node: Node, key?: number): ReactElement {
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.attrs)) {
    props[/^(aria|data)-/.test(name) ? name : camel(name)] = value;
  }
  if (key !== undefined) props.key = key;
  return createElement(
    node.tag,
    props,
    ...node.children.map((child, index) => toElement(child, index)),
  );
}

export function Icon({ name, size = 16, filled = false, rotate = 0, className }: IconProps) {
  const root = toElement(treeFor(name, filled, rotate));
  return createElement(root.type as string, {
    ...(root.props as object),
    className: classigo("ic", className),
    style: { inlineSize: size, blockSize: size },
  });
}
