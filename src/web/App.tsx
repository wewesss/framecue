import { isTextEntryTarget } from "@standarx/nav";
import classigo from "classigo";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Item, ItemKind, Region, RenderEvent } from "../core/types";
import { agentFixedItems } from "./agent";
import {
  api,
  type ExportFormat,
  exportText,
  type ItemChanges,
  subscribeEvents,
  type VideoResponse,
} from "./api";
import { copyText } from "./clipboard";
import { HelpSheet } from "./components/HelpSheet";
import { ItemDetail } from "./components/ItemDetail";
import { type Filter, QueuePanel } from "./components/QueuePanel";
import { Stage } from "./components/Stage";
import { Timeline } from "./components/Timeline";
import { Toast, type ToastData } from "./components/Toast";
import { ToolsRow } from "./components/ToolsRow";
import { TopBar } from "./components/TopBar";
import { Transport } from "./components/Transport";
import { fpsValue } from "./format";
import { useT } from "./i18n";
import { NavBridge } from "./NavBridge";
import { NATIVE } from "./nav";
import { useKeyboardNav } from "./settings";
import { type Action, shortcutAction } from "./shortcuts";
import { applyOrder } from "./sortable";
import { useTheme } from "./theme";
import { useTimelineView } from "./timeline/useTimelineView";
import { ZOOM_STEP } from "./timeline/zoom";
import { emptySelection, type Selection } from "./types";
import { Button } from "./ui/Button";
import { Tooltip, TooltipHost } from "./ui/Tooltip";
import { useVideoFrame } from "./useVideoFrame";
import { needsVerification, nextToVerify } from "./verify";

const PANEL_MIN = 320;
const PANEL_MAX = 400;

function blocksShortcut(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || isTextEntryTarget(target)) return true;
  const activates = key === " " || key === "Enter";
  return (
    activates &&
    (["BUTTON", "A", "INPUT"].includes(target.tagName) || target.hasAttribute("draggable"))
  );
}

function focusStage() {
  document.querySelector<HTMLElement>("[data-stage]")?.focus();
}

function focusRow(id: string) {
  document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus();
}

export function App() {
  const t = useT();
  const { mode: themeMode, theme, setMode: setThemeMode, toggle: toggleTheme } = useTheme();
  const [navEnabled, setNavEnabled] = useKeyboardNav();
  const [info, setInfo] = useState<VideoResponse | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [regionMode, setRegionMode] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(360);
  const [resizing, setResizing] = useState(false);
  const [snap, setSnap] = useState(false);
  const [longPress, setLongPress] = useState(true);
  const [wave, setWave] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [batchDone, setBatchDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const player = useVideoFrame(videoRef, info?.fps, info?.frameCount);
  const { frame, seekFrame } = player;
  const frameLatest = useRef(0);
  frameLatest.current = frame;
  const resumeFrame = useRef<number | null>(null);
  const tl = useTimelineView(info?.frameCount ?? 0);

  const report = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => {
    api
      .video()
      .then(setInfo)
      .then(() => api.items())
      .then(setItems)
      .catch(report);
  }, [report]);

  const itemsRef = useRef<Item[]>(items);
  itemsRef.current = items;

  const onAgentFixed = useRef((_fixed: Item[], _all: Item[]) => {});
  onAgentFixed.current = (fixed, all) => {
    const rankOf = new Map(
      [...all].sort((a, b) => a.priority - b.priority).map((it, i) => [it.id, i + 1]),
    );
    const first = fixed[0] as Item;
    const notice =
      fixed.length === 1
        ? t("toast.agentFixed", { n: rankOf.get(first.id) ?? 0 })
        : t("toast.agentFixedMany", { n: fixed.length });
    setToast({ id: Date.now(), verify: 0, skipped: 0, timing: null, notice });
  };

  const onRender = useRef((_event: RenderEvent) => {});
  onRender.current = (event) => {
    if (videoRef.current) resumeFrame.current = frameLatest.current;
    Promise.all([api.video(), api.items()])
      .then(([video, list]) => {
        setInfo(video);
        setItems(list);
      })
      .catch(report);
    const timing = event.timingChanged;
    const describe = (s: { fps: number; frameCount: number }) =>
      `${t("unit.fps", { n: fpsValue(s.fps) })} · ${t("unit.frames", { n: s.frameCount })}`;
    setBatchDone(false);
    setToast({
      id: Date.now(),
      verify: event.capturedIds.length,
      skipped: event.skipped.length,
      timing: timing ? { from: describe(timing.from), to: describe(timing.to) } : null,
      notice: null,
    });
  };

  useEffect(
    () =>
      subscribeEvents({
        render: (event) => onRender.current(event),
        items: () => {
          api
            .items()
            .then((list) => {
              const fixed = agentFixedItems(itemsRef.current, list);
              setItems(list);
              if (fixed.length > 0) onAgentFixed.current(fixed, list);
            })
            .catch(report);
        },
      }),
    [report],
  );

  useEffect(() => {
    const target = resumeFrame.current;
    const video = videoRef.current;
    if (target === null || !video || !info) return;
    resumeFrame.current = null;
    video.addEventListener("loadedmetadata", () => seekFrame(target), { once: true });
  }, [info, seekFrame]);

  const sorted = useMemo(() => [...items].sort((a, b) => a.priority - b.priority), [items]);
  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId],
  );
  const rank = useMemo(() => new Map(sorted.map((it, index) => [it.id, index + 1])), [sorted]);
  const selectedNumber = selectedItem ? sorted.findIndex((it) => it.id === selectedItem.id) + 1 : 0;

  const setIn = useCallback(() => {
    setSelection((s) => ({ ...s, in: frame, out: s.out !== null && s.out < frame ? null : s.out }));
  }, [frame]);

  const setOut = useCallback(() => {
    setSelection((s) => ({ ...s, out: frame, in: s.in !== null && s.in > frame ? null : s.in }));
  }, [frame]);

  const clear = useCallback(() => {
    setSelection(emptySelection);
    setRegionMode(false);
    setSelectedId(null);
  }, []);

  const add = useCallback(async () => {
    if (!info || busy) return;
    const isRange = selection.in !== null && selection.out !== null && selection.in < selection.out;
    const kind: ItemKind = selection.region ? "region" : isRange ? "range" : "frame";
    const frameStart = isRange ? (selection.in as number) : frame;
    const frameEnd = isRange ? (selection.out as number) : frameStart;
    setBusy(true);
    try {
      const created = await api.create({
        kind,
        frameStart,
        frameEnd,
        region: selection.region,
        comment: "",
      });
      setItems(await api.items());
      setFilter("all");
      setSelectedId(created.id);
      setFocusId(created.id);
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }, [info, busy, selection, frame, report]);

  const handlers: Record<Action, () => void> = {
    toggle: player.toggle,
    prev: () => player.step(-1),
    next: () => player.step(1),
    back10: () => player.step(-10),
    forward10: () => player.step(10),
    first: () => seekFrame(0),
    last: () => seekFrame((info?.frameCount ?? 1) - 1),
    setIn,
    setOut,
    region: () => setRegionMode((on) => !on),
    add: () => void add(),
    clear: () => (helpOpen ? setHelpOpen(false) : clear()),
    help: () => setHelpOpen((open) => !open),
    zoomIn: () => tl.zoomBy(ZOOM_STEP, frame + 0.5),
    zoomOut: () => tl.zoomBy(1 / ZOOM_STEP, frame + 0.5),
    fit: tl.fit,
    snap: () => setSnap((on) => !on),
    verify: () =>
      selectedItem && needsVerification(selectedItem) && void verdict(selectedItem.id, "verified"),
    reopen: () =>
      selectedItem && needsVerification(selectedItem) && void verdict(selectedItem.id, "reopened"),
    copy: () => void copyForAgent("md"),
  };
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const helpOpenRef = useRef(helpOpen);
  helpOpenRef.current = helpOpen;
  const navRef = useRef(navEnabled);
  navRef.current = navEnabled;
  const navActions = useCallback(
    () => ({ step: (n: number) => handlersRef.current[n < 0 ? "prev" : "next"]() }),
    [],
  );

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (blocksShortcut(event.target, event.key)) return;
      if (
        !navRef.current &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.defaultPrevented &&
        !(event.target instanceof HTMLElement && event.target.closest(NATIVE))
      ) {
        event.preventDefault();
        handlersRef.current[event.key === "ArrowLeft" ? "prev" : "next"]();
        return;
      }
      const action = shortcutAction({
        key: event.key,
        shift: event.shiftKey,
        alt: event.altKey,
        mod: event.ctrlKey || event.metaKey,
      });
      if (!action) return;
      if (helpOpenRef.current && action !== "clear" && action !== "help") return;
      if (
        (action === "verify" || action === "reopen") &&
        event.target instanceof HTMLElement &&
        event.target.closest('[role="dialog"], [role="alertdialog"]')
      ) {
        return;
      }
      event.preventDefault();
      handlersRef.current[action]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyForAgent = async (format: ExportFormat, ids?: string[]) => {
    try {
      const { text, count } = await exportText(format, ids);
      if (count === 0) return;
      await copyText(text);
      setToast({
        id: Date.now(),
        verify: 0,
        skipped: 0,
        timing: null,
        notice: t("copy.done", { n: count, format: format === "md" ? "Markdown" : "JSONL" }),
      });
    } catch (e) {
      report(new Error(t("copy.failed", { error: e instanceof Error ? e.message : String(e) })));
    }
  };

  const select = (item: Item) => {
    setBatchDone(false);
    setSelectedId(item.id);
    setFocusId(null);
    setConfirmingId(null);
    seekFrame(item.frameStart);
    setRegionMode(false);
    setSelection({
      in: item.frameStart,
      out: item.frameEnd > item.frameStart ? item.frameEnd : null,
      region: item.region ?? null,
    });
  };

  const change = (id: string, changes: ItemChanges): Promise<boolean> =>
    api
      .update(id, changes)
      .then((updated) => {
        setItems((list) => list.map((it) => (it.id === id ? updated : it)));
        return true;
      })
      .catch((e) => {
        report(e);
        return false;
      });

  const verdict = async (id: string, status: "verified" | "reopened") => {
    if (!(await change(id, { status }))) return;
    const updated = sorted.map((it) => (it.id === id ? { ...it, status } : it));
    const next = nextToVerify(updated, id);
    if (!next) {
      setBatchDone(true);
      return;
    }
    select(next);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-row-id="${CSS.escape(next.id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const recapture = (id: string): Promise<boolean> =>
    api
      .recaptureAfter(id)
      .then((updated) => {
        setItems((list) => list.map((it) => (it.id === id ? updated : it)));
        return true;
      })
      .catch((e) => {
        report(e);
        return false;
      });

  const remove = (id: string) => {
    const index = sorted.findIndex((it) => it.id === id);
    const next = sorted[index + 1] ?? sorted[index - 1] ?? null;
    api
      .remove(id)
      .then(() => {
        setItems((list) => list.filter((it) => it.id !== id));
        setConfirmingId(null);
        if (next) {
          select(next);
          requestAnimationFrame(() => focusRow(next.id));
        } else {
          setSelectedId(null);
        }
      })
      .catch(report);
  };

  const reorder = (ids: string[]) => {
    const previous = items;
    setItems(applyOrder(previous, ids));
    api
      .reorder(ids)
      .then(setItems)
      .catch((e) => {
        setItems(previous);
        report(e);
      });
  };

  const onRegion = (region: Region) => {
    setSelection((s) => ({ ...s, region }));
  };

  const onRange = useCallback((range: { in: number | null; out: number | null }) => {
    setSelection((s) => ({ ...s, in: range.in, out: range.out }));
  }, []);

  const seekTo = (target: number) => {
    player.pause();
    seekFrame(target);
  };

  const onPanelKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Delete" || !selectedItem) return;
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;
    event.preventDefault();
    setConfirmingId(selectedItem.id);
  };

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  };

  const moveResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setPanelWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, window.innerWidth - event.clientX)));
  };

  return (
    <>
      <div className="app" style={{ "--panel-w": `${panelWidth}px` } as CSSProperties}>
        <TopBar
          info={info}
          theme={theme}
          themeMode={themeMode}
          navEnabled={navEnabled}
          helpOpen={helpOpen}
          onToggleTheme={toggleTheme}
          onThemeMode={setThemeMode}
          onNavEnabled={setNavEnabled}
          onToggleHelp={() => setHelpOpen((open) => !open)}
        />
        <main className="main" data-snav="container">
          {error && (
            <div className="banner" role="alert">
              <span>{error}</span>
              <Button onClick={() => setError(null)}>{t("app.dismiss")}</Button>
            </div>
          )}
          {toast && (
            <Toast
              key={toast.id}
              data={toast}
              onSee={() => {
                setFilter("fixed");
                setToast(null);
              }}
              onDismiss={() => setToast(null)}
            />
          )}
          {info ? (
            <>
              <Stage
                videoRef={videoRef}
                video={info}
                region={selection.region}
                regionMode={regionMode}
                onRegion={onRegion}
              />
              <Timeline
                video={info}
                tl={tl}
                frame={frame}
                playing={player.playing}
                items={items}
                rank={rank}
                selectedId={selectedId}
                filter={filter}
                selection={selection}
                snap={snap}
                longPress={longPress}
                wave={wave}
                theme={theme}
                onSeek={seekTo}
                onSelectItem={select}
                onRange={onRange}
              />
              <ToolsRow
                tl={tl}
                items={items}
                frame={frame}
                fps={info.fps}
                hasAudio={info.audio !== null}
                wave={wave}
                snap={snap}
                longPress={longPress}
                onWave={setWave}
                onSnap={setSnap}
                onLongPress={setLongPress}
              />
              <Transport
                frame={frame}
                fps={info.fps}
                frameCount={info.frameCount}
                playing={player.playing}
                selection={selection}
                regionMode={regionMode}
                busy={busy}
                onToggle={player.toggle}
                onStep={player.step}
                onSeek={seekTo}
                onSetIn={setIn}
                onSetOut={setOut}
                onToggleRegion={() => setRegionMode((on) => !on)}
                onClear={clear}
                onAdd={() => void add()}
              />
            </>
          ) : (
            <div className="stage stage--loading">
              {error ? t("app.loadError") : t("app.loading")}
            </div>
          )}
        </main>
        <aside
          className="panel"
          data-snav="container"
          aria-label={t("queue.label")}
          onKeyDown={onPanelKey}
        >
          <Tooltip tip={t("queue.resize")}>
            <div
              className={classigo("panel__resizer", { "panel__resizer--drag": resizing })}
              aria-hidden="true"
              onPointerDown={startResize}
              onPointerMove={moveResize}
              onPointerUp={() => setResizing(false)}
              onPointerCancel={() => setResizing(false)}
            />
          </Tooltip>
          <QueuePanel
            items={items}
            selectedId={selectedId}
            filter={filter}
            onFilter={setFilter}
            onSelect={select}
            onReorder={reorder}
            onCopy={(format, ids) => void copyForAgent(format, ids)}
          />
          <ItemDetail
            item={selectedItem}
            number={selectedNumber}
            autoFocus={selectedItem?.id === focusId}
            batchDone={batchDone}
            confirming={selectedItem !== null && confirmingId === selectedItem.id}
            onRequestDelete={() => selectedItem && setConfirmingId(selectedItem.id)}
            onCancelDelete={() => setConfirmingId(null)}
            onChange={change}
            onDelete={remove}
            onSeek={seekTo}
            onVerify={(id) => void verdict(id, "verified")}
            onReopen={(id) => void verdict(id, "reopened")}
            onRecapture={recapture}
            onCopy={(format, ids) => void copyForAgent(format, ids)}
            onTyping={player.pause}
            onLeaveComment={focusStage}
          />
        </aside>
      </div>
      {navEnabled && <NavBridge actions={navActions} />}
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      <TooltipHost />
    </>
  );
}
