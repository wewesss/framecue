import {
  cloneElement,
  type FocusEvent,
  Fragment,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Kbd } from "./Kbd";
import { placeTip, type TipPosition } from "./placement";

export type TipKeys = ReadonlyArray<string | readonly string[]>;

interface TipState {
  target: HTMLElement;
  content: ReactNode;
  keys?: TipKeys;
}

const SHOW_DELAY = 380;
const TIP_ID = "fc-tooltip";

let current: TipState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TipState | null {
  return current;
}

function showTip(next: TipState) {
  current?.target.removeAttribute("aria-describedby");
  current = next;
  next.target.setAttribute("aria-describedby", TIP_ID);
  emit();
}

export function hideTip(target?: HTMLElement) {
  if (!current || (target && current.target !== target)) return;
  current.target.removeAttribute("aria-describedby");
  current = null;
  emit();
}

interface TooltipTargetProps {
  onPointerEnter?(event: PointerEvent<HTMLElement>): void;
  onPointerLeave?(event: PointerEvent<HTMLElement>): void;
  onPointerDown?(event: PointerEvent<HTMLElement>): void;
  onFocus?(event: FocusEvent<HTMLElement>): void;
  onBlur?(event: FocusEvent<HTMLElement>): void;
}

interface TooltipProps {
  tip: ReactNode;
  keys?: TipKeys;
  children: ReactElement<TooltipTargetProps>;
}

export function Tooltip({ tip, keys, children }: TooltipProps) {
  const timer = useRef<number | undefined>(undefined);
  const owned = useRef<HTMLElement | null>(null);
  const child = children.props;

  const cancel = () => window.clearTimeout(timer.current);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (owned.current) hideTip(owned.current);
    },
    [],
  );

  return cloneElement(children, {
    onPointerEnter: (event) => {
      child.onPointerEnter?.(event);
      if (event.pointerType === "touch") return;
      const target = event.currentTarget;
      cancel();
      timer.current = window.setTimeout(() => {
        owned.current = target;
        showTip({ target, content: tip, keys });
      }, SHOW_DELAY);
    },
    onPointerLeave: (event) => {
      child.onPointerLeave?.(event);
      cancel();
      hideTip(event.currentTarget);
    },
    onPointerDown: (event) => {
      child.onPointerDown?.(event);
      cancel();
      hideTip();
    },
    onFocus: (event) => {
      child.onFocus?.(event);
      if (!event.target.matches(":focus-visible")) return;
      cancel();
      owned.current = event.currentTarget;
      showTip({ target: event.currentTarget, content: tip, keys });
    },
    onBlur: (event) => {
      child.onBlur?.(event);
      cancel();
      hideTip(event.currentTarget);
    },
  });
}

export function TooltipHost() {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TipPosition | null>(null);

  useEffect(() => {
    const onDown = () => hideTip();
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  useLayoutEffect(() => {
    const tip = ref.current;
    if (!state || !tip) {
      setPosition(null);
      return;
    }
    const target = state.target.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    setPosition(
      placeTip(
        { top: target.top, left: target.left, width: target.width, height: target.height },
        { width: size.width, height: size.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [state]);

  if (!state) return null;

  return createPortal(
    <div
      ref={ref}
      id={TIP_ID}
      className="tip"
      role="tooltip"
      style={position ?? { top: 0, left: 0, visibility: "hidden" }}
    >
      <span>{state.content}</span>
      {state.keys && state.keys.length > 0 && (
        <span className="tip__keys">
          {state.keys.map((alt) => {
            const combo = typeof alt === "string" ? [alt] : alt;
            return (
              <span key={combo.join("+")} className="tip__combo">
                {combo.map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 && "+"}
                    <Kbd>{key}</Kbd>
                  </Fragment>
                ))}
              </span>
            );
          })}
        </span>
      )}
    </div>,
    document.body,
  );
}
