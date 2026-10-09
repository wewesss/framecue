import classigo from "classigo/lite";
import type { ReactNode, RefObject } from "react";
import { Floating } from "./Floating";
import type { Align } from "./placement";

interface PopoverProps {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  label: string;
  align?: Align;
  className?: string;
  autoFocus?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Popover({
  open,
  anchor,
  label,
  align = "left",
  className,
  autoFocus,
  onClose,
  children,
}: PopoverProps) {
  if (!open) return null;
  return (
    <Floating
      anchor={anchor}
      align={align}
      role="dialog"
      label={label}
      className={classigo("popover", className)}
      autoFocus={autoFocus}
      onClose={onClose}
    >
      {children}
    </Floating>
  );
}
