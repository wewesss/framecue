import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import {
  autoScrollSpeed,
  clampOffset,
  DRAG_THRESHOLD,
  type Slot,
  siblingShift,
  targetIndex,
} from "./sortable";

const LIFT_SCALE = 1.02;

interface Placed {
  top: number;
  scale: number;
}

type Snapshot = Map<string, Placed>;

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  startScroll: number;
  active: boolean;
  lastY: number;
  from: number;
  to: number;
  gap: number;
  rows: HTMLElement[];
  slots: Slot[];
  shifts: number[];
  raf: number;
}

interface SortableOptions {
  listRef: RefObject<HTMLElement | null>;
  orderKey: string;
  scope: string;
  onMove: (id: string, to: number) => void;
}

const rowsOf = (list: HTMLElement) =>
  Array.from(list.querySelectorAll<HTMLElement>("[data-row-id]"));

const contentTop = (el: HTMLElement, list: HTMLElement) =>
  el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function springOf(list: HTMLElement) {
  const style = getComputedStyle(list);
  const raw = style.getPropertyValue("--fc-spring-smooth-d").trim();
  const seconds = raw.endsWith("ms") ? Number.parseFloat(raw) / 1000 : Number.parseFloat(raw);
  return {
    duration: Number.isFinite(seconds) ? seconds * 1000 : 520,
    easing: style.getPropertyValue("--fc-spring-smooth").trim() || "ease-out",
  };
}

export function useSortable({ listRef, orderKey, scope, onMove }: SortableOptions) {
  const dragRef = useRef<Drag | null>(null);
  const placed = useRef<Snapshot>(new Map());
  const pending = useRef<Snapshot | null>(null);
  const lastScope = useRef(scope);
  const lastKey = useRef<string | null>(null);
  const swallow = useRef(false);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  const settle = useCallback(
    (from: Snapshot | null) => {
      const list = listRef.current;
      if (!list) return;
      delete list.dataset.sorting;
      const rows = rowsOf(list);
      for (const row of rows) {
        row.getAnimations().forEach((animation) => {
          animation.cancel();
        });
        row.style.transform = "";
        row.style.zIndex = "";
        delete row.dataset.lifted;
      }
      const next: Snapshot = new Map();
      const animate = from !== null && !reducedMotion();
      const spring = animate ? springOf(list) : null;
      for (const row of rows) {
        const id = row.dataset.rowId as string;
        const top = contentTop(row, list);
        next.set(id, { top, scale: 1 });
        const before = from?.get(id);
        if (!before || !spring) continue;
        const dy = before.top - top;
        if (Math.abs(dy) < 0.5 && before.scale === 1) continue;
        const lifted = before.scale !== 1;
        if (lifted) row.style.zIndex = "2";
        const scale = lifted ? ` scale(${before.scale})` : "";
        const anim = row.animate(
          [{ transform: `translateY(${dy}px)${scale}` }, { transform: "translateY(0) scale(1)" }],
          spring,
        );
        anim.onfinish = anim.oncancel = () => {
          row.style.zIndex = "";
        };
      }
      placed.current = next;
    },
    [listRef],
  );

  useLayoutEffect(() => {
    const changedKey = lastKey.current !== orderKey;
    lastKey.current = orderKey;
    const changedScope = lastScope.current !== scope;
    lastScope.current = scope;
    const from = pending.current;
    pending.current = null;
    if (!changedKey && !changedScope && !from) return;
    settle(from ?? (changedScope ? null : placed.current));
  }, [orderKey, scope, settle]);

  const snapshot = (drag: Drag): Snapshot => {
    const map: Snapshot = new Map();
    drag.rows.forEach((row, index) => {
      map.set(row.dataset.rowId as string, {
        top: drag.slots[index].top + drag.shifts[index],
        scale: index === drag.from ? LIFT_SCALE : 1,
      });
    });
    return map;
  };

  const update = (drag: Drag) => {
    const list = listRef.current;
    if (!list) return;
    const { slots, from } = drag;
    const item = slots[from];
    const size = item.height - drag.gap;
    const last = slots[slots.length - 1];
    const minTop = Math.max(slots[0].top, list.scrollTop);
    const maxBottom = Math.min(
      last.top + last.height - drag.gap,
      list.scrollTop + list.clientHeight,
    );
    const raw = drag.lastY - drag.startY + (list.scrollTop - drag.startScroll);
    const offset = clampOffset(raw, item.top, size, minTop, maxBottom);
    drag.to = targetIndex(item.top + offset + size / 2, slots);
    drag.rows.forEach((row, index) => {
      if (index === from) {
        drag.shifts[index] = offset;
        row.style.transform = `translateY(${offset}px) scale(${LIFT_SCALE})`;
        return;
      }
      const shift = siblingShift(index, from, drag.to, item.height);
      drag.shifts[index] = shift;
      row.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const list = listRef.current;
    if (!list || dragRef.current || event.button !== 0 || !event.isPrimary) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, button, a")) return;
    const fromGrip = target.closest(".row__grip") !== null;
    if (event.pointerType === "touch" && !fromGrip) return;
    const row = event.currentTarget;
    const drag: Drag = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: list.scrollTop,
      active: false,
      lastY: event.clientY,
      from: 0,
      to: 0,
      gap: 0,
      rows: [],
      slots: [],
      shifts: [],
      raf: 0,
    };
    dragRef.current = drag;

    const cleanup = () => {
      cancelAnimationFrame(drag.raf);
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      row.removeEventListener("lostpointercapture", onCancel);
      if (row.hasPointerCapture(drag.pointerId)) row.releasePointerCapture(drag.pointerId);
      dragRef.current = null;
    };

    const finish = (commit: boolean) => {
      const wasActive = drag.active;
      cleanup();
      if (!wasActive) return;
      swallow.current = true;
      setTimeout(() => {
        swallow.current = false;
      }, 0);
      const from = snapshot(drag);
      if (commit && drag.to !== drag.from) {
        pending.current = from;
        moveRef.current(drag.id, drag.to);
        requestAnimationFrame(() => {
          if (pending.current === from) {
            pending.current = null;
            settle(from);
          }
        });
        return;
      }
      settle(from);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId === drag.pointerId) finish(true);
    };

    const onCancel = () => finish(false);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !drag.active) return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };

    const tick = () => {
      const bounds = list.getBoundingClientRect();
      const speed = autoScrollSpeed(drag.lastY, bounds.top, bounds.bottom);
      if (speed !== 0) {
        const before = list.scrollTop;
        list.scrollTop += Math.sign(speed) * Math.max(1, Math.round(Math.abs(speed)));
        if (list.scrollTop !== before) update(drag);
      }
      drag.raf = requestAnimationFrame(tick);
    };

    const begin = () => {
      const rows = rowsOf(list);
      const from = rows.findIndex((r) => r.dataset.rowId === id);
      if (from < 0 || rows.length < 2) return false;
      for (const r of rows) {
        r.getAnimations().forEach((animation) => {
          animation.cancel();
        });
      }
      drag.gap = Number.parseFloat(getComputedStyle(rows[0]).marginBottom) || 0;
      drag.rows = rows;
      drag.from = from;
      drag.to = from;
      drag.shifts = rows.map(() => 0);
      drag.slots = rows.map((r) => ({
        top: contentTop(r, list),
        height: r.getBoundingClientRect().height + drag.gap,
      }));
      drag.startScroll = list.scrollTop;
      drag.active = true;
      list.dataset.sorting = "";
      row.dataset.lifted = "";
      row.setPointerCapture(drag.pointerId);
      row.addEventListener("lostpointercapture", onCancel);
      drag.raf = requestAnimationFrame(tick);
      return true;
    };

    const onMoveEvent = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      if ((e.buttons & 1) === 0) {
        finish(false);
        return;
      }
      drag.lastY = e.clientY;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
        if (!begin()) {
          cleanup();
          return;
        }
      }
      update(drag);
    };

    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  };

  const takeClick = () => swallow.current;

  return { onPointerDown, takeClick };
}
