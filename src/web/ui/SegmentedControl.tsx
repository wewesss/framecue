import classigo from "classigo";
import { compile } from "matchigo";
import { type CSSProperties, type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { type NavKey, nextEnabled } from "./menuNav";
import { type TipKeys, Tooltip } from "./Tooltip";

export interface SegmentOption<V extends string> {
  value: V;
  content: ReactNode;
  label?: string;
  disabled?: boolean;
  tip?: ReactNode;
  tipKeys?: TipKeys;
  className?: string;
}

export type SegmentedVariant = "default" | "status" | "mini";

interface SegmentedControlProps<V extends string> {
  label: string;
  value: V | null;
  options: readonly SegmentOption<V>[];
  onChange: (value: V) => void;
  variant?: SegmentedVariant;
  className?: string;
}

const arrowKey = compile<string, NavKey | null>([
  { with: "ArrowRight", then: "ArrowDown" },
  { with: "ArrowDown", then: "ArrowDown" },
  { with: "ArrowLeft", then: "ArrowUp" },
  { with: "ArrowUp", then: "ArrowUp" },
  { with: "Home", then: "Home" },
  { with: "End", then: "End" },
  { otherwise: null },
]);

export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  variant = "default",
  className,
}: SegmentedControlProps<V>) {
  const selected = options.findIndex((option) => option.value === value);
  const [trail, setTrail] = useState({ index: selected, previous: selected, shown: 0 });
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);

  let current = trail;
  if (trail.index !== selected) {
    current = {
      index: selected,
      previous: trail.index,
      shown: selected >= 0 ? selected : trail.shown,
    };
    setTrail(current);
  }
  const shown = selected >= 0 ? selected : current.shown;
  const still = selected < 0 || current.previous < 0;

  const firstEnabled = options.findIndex((option) => !option.disabled);
  const tabbable = selected >= 0 && !options[selected]?.disabled ? selected : firstEnabled;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = arrowKey(event.key);
    if (!key) return;
    event.preventDefault();
    const active = nodes.current.indexOf(document.activeElement as HTMLButtonElement);
    const next = nextEnabled(
      options.map((option) => option.disabled === true),
      active >= 0 ? active : Math.max(selected, 0),
      key,
    );
    const option = options[next];
    if (!option) return;
    nodes.current[next]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const style = { "--n": options.length, "--i": shown } as CSSProperties;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={classigo(
        "seg",
        {
          "seg--default": variant === "default",
          "seg--status": variant === "status",
          "seg--mini": variant === "mini",
        },
        className,
      )}
      style={style}
      onKeyDown={onKeyDown}
    >
      <i
        aria-hidden="true"
        className={classigo("seg__ind", {
          "seg__ind--still": still,
          "seg__ind--empty": selected < 0,
        })}
      />
      {options.map((option, index) => {
        const button = (
          // biome-ignore lint/a11y/useSemanticElements: native radios cannot carry the sliding pill layout
          <button
            key={option.value}
            ref={(node) => {
              nodes.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={index === selected}
            aria-label={option.label}
            aria-disabled={option.disabled || undefined}
            tabIndex={index === tabbable ? 0 : -1}
            className={classigo("seg__option", option.className)}
            onClick={() => {
              if (!option.disabled && option.value !== value) onChange(option.value);
            }}
          >
            {option.content}
          </button>
        );
        return option.tip ? (
          <Tooltip key={option.value} tip={option.tip} keys={option.tipKeys}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
