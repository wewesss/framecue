import classigo from "classigo";
import { type KeyboardEvent, type ReactElement, type RefObject, useRef, useState } from "react";
import { Floating } from "./Floating";
import { Icon, type IconName } from "./Icon";
import { Kbd } from "./Kbd";
import { isNavKey, nextEnabled } from "./menuNav";
import type { Align } from "./placement";

export type MenuEntry =
  | {
      type: "item";
      id: string;
      label: string;
      icon?: IconName;
      keys?: string[];
      checked?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: "separator"; id: string }
  | { type: "title"; id: string; label: string };

export interface MenuTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  "aria-expanded": boolean;
  "aria-haspopup": "menu";
}

interface MenuProps {
  label: string;
  entries: MenuEntry[];
  align?: Align;
  trigger: (props: MenuTriggerProps) => ReactElement;
}

const FIRST_ENABLED = '[role="menuitem"]:not([aria-disabled="true"])';

export function Menu({ label, entries, align = "left", trigger }: MenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const items = entries.filter((entry) => entry.type === "item");

  const close = () => setOpen(false);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isNavKey(event.key)) return;
    event.preventDefault();
    const nodes = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const current = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const next = nextEnabled(
      items.map((item) => item.disabled === true),
      current,
      event.key,
    );
    nodes[next]?.focus({ preventScroll: true });
  };

  return (
    <>
      {trigger({
        ref: anchor,
        onClick: () => setOpen((value) => !value),
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })}
      {open && (
        <Floating
          anchor={anchor}
          align={align}
          role="menu"
          label={label}
          className="menu"
          onClose={close}
          onKeyDown={onKeyDown}
          autoFocus={FIRST_ENABLED}
        >
          {entries.map((entry) => {
            if (entry.type === "separator") return <hr key={entry.id} />;
            if (entry.type === "title") {
              return (
                <div key={entry.id} className="menu__title">
                  {entry.label}
                </div>
              );
            }
            return (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                className={classigo("menu__item", { "menu__item--checked": entry.checked })}
                aria-disabled={entry.disabled || undefined}
                onClick={() => {
                  if (entry.disabled) return;
                  close();
                  anchor.current?.focus();
                  entry.onSelect();
                }}
              >
                {entry.icon && <Icon name={entry.icon} size={14} />}
                <span className="menu__label">{entry.label}</span>
                {entry.keys?.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
                {entry.checked !== undefined && (
                  <span className="menu__check">
                    <Icon name="checkmark" size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </Floating>
      )}
    </>
  );
}
