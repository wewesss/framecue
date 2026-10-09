import classigo from "classigo";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";
import { type CompareLabels, CompareView } from "./CompareView";

export interface LightboxCompare {
  before: string;
  after: string;
  labels: CompareLabels;
}

interface LightboxProps {
  src?: string;
  compare?: LightboxCompare;
  alt: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
}

export function Lightbox({ src, compare, alt, title, closeLabel, onClose }: LightboxProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const button = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    button.current?.querySelector("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus();
    };
  }, []);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="lightbox__scrim"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={onClose}
      />
      <figure
        className={classigo("lightbox__figure", {
          "lightbox__figure--compare": compare !== undefined,
        })}
      >
        {compare ? (
          <CompareView before={compare.before} after={compare.after} labels={compare.labels} />
        ) : (
          <img className="lightbox__image" src={src} alt={alt} />
        )}
        <div ref={button} className="lightbox__close">
          <IconButton icon="xmark" label={closeLabel} onClick={onClose} />
        </div>
      </figure>
    </div>,
    document.body,
  );
}
