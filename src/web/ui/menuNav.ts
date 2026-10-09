export type NavKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function isNavKey(key: string): key is NavKey {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End";
}

export function nextEnabled(disabled: readonly boolean[], current: number, key: NavKey): number {
  const count = disabled.length;
  const enabled = (index: number) => disabled[index] === false;
  if (!disabled.some((_, index) => enabled(index))) return -1;

  const effective: NavKey =
    current < 0 && key === "ArrowDown" ? "Home" : current < 0 && key === "ArrowUp" ? "End" : key;

  if (effective === "Home") return disabled.findIndex((_, index) => enabled(index));
  if (effective === "End") {
    for (let index = count - 1; index >= 0; index--) if (enabled(index)) return index;
  }

  const step = key === "ArrowDown" ? 1 : -1;
  let index = current;
  for (let tries = 0; tries < count; tries++) {
    index = (index + step + count) % count;
    if (enabled(index)) return index;
  }
  return current;
}
