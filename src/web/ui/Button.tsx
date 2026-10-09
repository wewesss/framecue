import classigo from "classigo";
import type { ComponentProps, MouseEvent } from "react";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "gray" | "primary" | "plain";

export interface ButtonProps extends Omit<ComponentProps<"button">, "type"> {
  variant?: ButtonVariant;
  icon?: IconName;
  type?: "button" | "submit";
}

function guard(disabled: boolean | undefined, onClick: ComponentProps<"button">["onClick"]) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
}

export function Button({
  variant = "gray",
  icon,
  disabled,
  onClick,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={classigo(
        "btn",
        {
          "btn--gray": variant === "gray",
          "btn--primary": variant === "primary",
          "btn--plain": variant === "plain",
        },
        className,
      )}
      aria-disabled={disabled || undefined}
      onClick={guard(disabled, onClick)}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export type IconButtonVariant = "default" | "play";

export interface IconButtonProps extends Omit<ComponentProps<"button">, "type" | "children"> {
  icon: IconName;
  label: string;
  size?: "md" | "sm";
  variant?: IconButtonVariant;
  pressed?: boolean;
  filled?: boolean;
  rotate?: number;
}

export function IconButton({
  icon,
  label,
  size = "md",
  variant = "default",
  pressed,
  filled,
  rotate,
  disabled,
  onClick,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      className={classigo(
        {
          play: variant === "play",
          "icon-btn": variant !== "play",
          "icon-btn--sm": variant === "default" && size === "sm",
        },
        className,
      )}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onClick={guard(disabled, onClick)}
    >
      <Icon name={icon} size={size === "sm" ? 15 : 16} filled={filled} rotate={rotate} />
    </button>
  );
}
