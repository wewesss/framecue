import classigo from "classigo/lite";
import {
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./Icon";
import { dragOutcome, dragProgress, passedThreshold } from "./switchLogic";

export interface SwitchProps extends Omit<ComponentProps<"label">, "onChange" | "children"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: IconName;
  label?: string;
  children?: ReactNode;
}

interface Drag {
  pointerId: number;
  startX: number;
  moved: boolean;
}

export function Switch({
  checked,
  onChange,
  disabled,
  icon,
  label,
  children,
  className,
  ...rest
}: SwitchProps) {
  const control = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  const [pressed, setPressed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [focusVisible, setFocusVisible] = useState(false);
  const state = checked ? "checked" : "unchecked";

  const progressAt = (clientX: number) => {
    const rect = control.current?.getBoundingClientRect();
    return dragProgress(clientX, rect?.left ?? 0, rect?.width ?? 0, checked);
  };

  const end = (finalProgress: number, moved: boolean) => {
    drag.current = null;
    setPressed(false);
    setDragging(false);
    if (!moved || disabled) return;
    const next = dragOutcome(finalProgress, checked);
    if (next !== null) onChange(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    if (drag.current || !event.isPrimary || disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
    swallowClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPressed(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (!current.moved && !passedThreshold(current.startX, event.clientX)) return;
    current.moved = true;
    event.preventDefault();
    setDragging(true);
    setProgress(progressAt(event.clientX));
  };

  const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    swallowClick.current = current.moved;
    end(progressAt(event.clientX), current.moved);
  };

  const onPointerCancel = (event: PointerEvent<HTMLSpanElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    end(checked ? 1 : 0, false);
  };

  const onClickCapture = (event: MouseEvent<HTMLSpanElement>) => {
    if (swallowClick.current) event.preventDefault();
  };

  const thumbStyle = dragging ? ({ "--fc-switch-progress": progress } as CSSProperties) : undefined;

  return (
    <label
      {...rest}
      className={classigo("msw", className)}
      data-state={state}
      data-disabled={disabled || undefined}
    >
      <input
        className="sr"
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        onFocus={(event) => setFocusVisible(event.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocusVisible(false)}
      />
      <span
        ref={control}
        className="msw-control"
        aria-hidden="true"
        data-state={state}
        data-focus-visible={focusVisible || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        <span
          className="msw-thumb"
          data-state={state}
          data-pressed={pressed || undefined}
          data-dragging={dragging || undefined}
          style={thumbStyle}
        >
          {icon && <Icon name={icon} size={10} className="msw-icon" />}
        </span>
      </span>
      {children !== undefined && <span className="msw-label">{children}</span>}
    </label>
  );
}
