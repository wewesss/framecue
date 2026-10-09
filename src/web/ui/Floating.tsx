import classigo from "classigo";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { type Align, type AnchoredPosition, anchoredPosition } from "./placement";

interface FloatingProps {
  anchor: RefObject<HTMLElement | null>;
  align?: Align;
  role: "menu" | "dialog";
  label: string;
  className?: string;
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  autoFocus?: string;
  children: ReactNode;
}

export function Floating({
  anchor,
  align = "left",
  role,
  label,
  className,
  onClose,
  onKeyDown,
  autoFocus,
  children,
}: FloatingProps) {
  const own = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<AnchoredPosition | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition(
      anchoredPosition(
        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        align,
        window.innerWidth,
      ),
    );
  }, [anchor, align]);

  const placed = position !== null;

  useEffect(() => {
    if (autoFocus && placed)
      own.current?.querySelector<HTMLElement>(autoFocus)?.focus({ preventScroll: true });
  }, [autoFocus, placed]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (own.current?.contains(target) || anchor.current?.contains(target)) return;
      closeRef.current();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        anchor.current?.focus();
      } else if (event.key === "Tab" && own.current?.contains(event.target as Node)) {
        closeRef.current();
      }
    };
    const onResize = () => closeRef.current();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
  }, [anchor]);

  const props = {
    ref: own,
    "aria-label": label,
    className: classigo("floating", className),
    style: position ?? { top: 0, left: 0, visibility: "hidden" as const },
    onKeyDown,
  };

  return createPortal(
    role === "menu" ? (
      <div role="menu" {...props}>
        {children}
      </div>
    ) : (
      <div role="dialog" {...props}>
        {children}
      </div>
    ),
    document.body,
  );
}
