import classigo from "classigo/lite";
import type { ComponentProps, ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  aside?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, aside, htmlFor, className, children }: FieldProps) {
  const row = (
    <>
      {label}
      {aside}
    </>
  );
  return (
    <div className={classigo("field", className)}>
      {htmlFor ? (
        <label className="field__label" htmlFor={htmlFor}>
          {row}
        </label>
      ) : (
        <div className="field__label">{row}</div>
      )}
      {children}
    </div>
  );
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea {...rest} className={classigo("textarea", className)} />;
}
