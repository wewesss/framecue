import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { SegmentedControl, type SegmentOption } from "./SegmentedControl";
import { wipeFromKey, wipeFromPointer } from "./wipe";

export interface CompareLabels {
  before: string;
  after: string;
  mode: string;
  side: string;
  wipe: string;
  slider: string;
}

interface CompareViewProps {
  before: string;
  after: string;
  labels: CompareLabels;
}

type Mode = "side" | "wipe";

export function CompareView({ before, after, labels }: CompareViewProps) {
  const [mode, setMode] = useState<Mode>("side");
  const [wipe, setWipe] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (mode === "wipe") barRef.current?.focus();
  }, [mode]);

  const options: SegmentOption<Mode>[] = [
    { value: "side", content: labels.side },
    { value: "wipe", content: labels.wipe },
  ];

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (rect) setWipe(wipeFromPointer(event.clientX, rect.left, rect.width));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = wipeFromKey(event.key, wipe, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setWipe(next);
  };

  return (
    <div className="compare">
      <div className="compare__bar">
        <SegmentedControl<Mode>
          label={labels.mode}
          variant="mini"
          value={mode}
          options={options}
          onChange={setMode}
        />
      </div>
      {mode === "side" ? (
        <div className="compare__side">
          <figure className="compare__pane">
            <img className="compare__img" src={before} alt={labels.before} />
            <figcaption className="compare__chip">{labels.before}</figcaption>
          </figure>
          <figure className="compare__pane">
            <img className="compare__img" src={after} alt={labels.after} />
            <figcaption className="compare__chip">{labels.after}</figcaption>
          </figure>
        </div>
      ) : (
        <div
          ref={frameRef}
          className="compare__wipe"
          style={{ "--wipe": `${wipe}%` } as CSSProperties}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            fromPointer(event);
            barRef.current?.focus();
          }}
          onPointerMove={(event) => {
            if (dragging.current) fromPointer(event);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          <img className="compare__img" src={after} alt={labels.after} draggable={false} />
          <img
            className="compare__img compare__img--before"
            src={before}
            alt={labels.before}
            draggable={false}
          />
          <span className="compare__chip compare__chip--before">{labels.before}</span>
          <span className="compare__chip compare__chip--after">{labels.after}</span>
          <div
            ref={barRef}
            className="compare__handle"
            role="slider"
            tabIndex={0}
            aria-label={labels.slider}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(wipe)}
            onKeyDown={onKeyDown}
          />
        </div>
      )}
    </div>
  );
}
