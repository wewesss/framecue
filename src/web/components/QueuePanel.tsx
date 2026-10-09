import classigo from "classigo";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Item, ItemKind, ItemStatus } from "../../core/types";
import type { ExportFormat } from "../api";
import { shortTimecode } from "../format";
import { itemTimecode } from "../frame";
import { Rich, useI18n } from "../i18n";
import { mapFilteredToFull } from "../sortable";
import { kindIcon, STATUSES, statusIcon, statusLabelKey } from "../status";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Menu, type MenuEntry } from "../ui/Menu";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { Tooltip } from "../ui/Tooltip";
import { useSortable } from "../useSortable";
import { needsVerification, verifyCount } from "../verify";
import { StatusTag } from "./StatusTag";

export type Filter = ItemStatus | "all";

interface QueuePanelProps {
  items: Item[];
  selectedId: string | null;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  onSelect: (item: Item) => void;
  onReorder: (ids: string[]) => void;
  onCopy: (format: ExportFormat, ids?: string[]) => void;
}

const kindKey = (kind: ItemKind) => `kind.${kind}` as const;

export function QueuePanel({
  items,
  selectedId,
  filter,
  onFilter,
  onSelect,
  onReorder,
  onCopy,
}: QueuePanelProps) {
  const { t } = useI18n();
  const [announce, setAnnounce] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  const sorted = useMemo(() => [...items].sort((a, b) => a.priority - b.priority), [items]);
  const visible = filter === "all" ? sorted : sorted.filter((it) => it.status === filter);
  const allIds = sorted.map((it) => it.id);
  const visibleIds = visible.map((it) => it.id);
  const rank = new Map(sorted.map((it, index) => [it.id, index + 1]));

  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, items.filter((it) => it.status === s).length]),
  ) as Record<ItemStatus, number>;

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id || sorted.length === 0) return;
    pendingFocus.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus();
  }, [sorted]);

  const move = (id: string, to: number) => {
    const next = mapFilteredToFull(allIds, visibleIds, id, to);
    if (next === allIds) return;
    pendingFocus.current = id;
    onReorder(next);
    setAnnounce(t("queue.moved", { n: next.indexOf(id) + 1, total: next.length }));
  };

  const sortable = useSortable({
    listRef,
    orderKey: visibleIds.join("|"),
    scope: filter,
    onMove: move,
  });

  const filterOptions: SegmentOption<Filter>[] = [
    {
      value: "all",
      tip: t("queue.allTip"),
      content: (
        <>
          {t("queue.all")} <span className="seg__n">{items.length}</span>
        </>
      ),
    },
    ...STATUSES.map<SegmentOption<Filter>>((status) => ({
      value: status,
      className: `s-${status}`,
      label: t(statusLabelKey(status)),
      tip: t(statusLabelKey(status)),
      content: (
        <>
          <span className="seg__st">
            <Icon name={statusIcon(status)} size={13} />
          </span>
          <span className="seg__n">{counts[status]}</span>
        </>
      ),
    })),
  ];

  const onRowKey = (event: KeyboardEvent<HTMLDivElement>, item: Item, index: number) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const to = index + (event.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < visible.length) move(item.id, to);
      return;
    }
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onSelect(item);
    }
  };

  const toDo = counts.todo + counts.reopened;

  const copyEntries: MenuEntry[] = [
    {
      type: "item",
      id: "md",
      label: t("copy.md"),
      icon: "doc.on.doc",
      disabled: toDo === 0,
      onSelect: () => onCopy("md"),
    },
    {
      type: "item",
      id: "jsonl",
      label: t("copy.jsonl"),
      icon: "doc.on.doc",
      disabled: toDo === 0,
      onSelect: () => onCopy("jsonl"),
    },
    { type: "separator", id: "sep" },
    {
      type: "item",
      id: "shown-md",
      label: t("copy.shownMd"),
      icon: "doc.on.doc",
      disabled: visible.length === 0,
      onSelect: () => onCopy("md", visibleIds),
    },
    {
      type: "item",
      id: "shown-jsonl",
      label: t("copy.shownJsonl"),
      icon: "doc.on.doc",
      disabled: visible.length === 0,
      onSelect: () => onCopy("jsonl", visibleIds),
    },
  ];

  return (
    <section className="queue" aria-label={t("queue.label")}>
      <header className="queue__head">
        <h2 className="queue__title">{t("queue.title")}</h2>
        <span className="queue__count num">{items.length}</span>
        <div className="spacer" />
        <SegmentedControl<Filter>
          label={t("queue.filter")}
          className="queue__filters"
          value={filter}
          options={filterOptions}
          onChange={onFilter}
        />
      </header>
      <div ref={listRef} className="queue__list" data-snav="container">
        {items.length === 0 && (
          <div className="empty">
            <Rich id="queue.empty" vars={{ enter: t("key.enter") }} />
          </div>
        )}
        {items.length > 0 && visible.length === 0 && (
          <div className="empty">{t("queue.emptyFilter")}</div>
        )}
        <div role="listbox" aria-label={t("queue.items")}>
          {visible.map((item, index) => {
            const isRange = item.frameEnd > item.frameStart;
            const selected = item.id === selectedId;
            return (
              <div
                key={item.id}
                data-row-id={item.id}
                className={classigo("row", {
                  "row--selected": selected,
                })}
                tabIndex={0}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  if (!sortable.takeClick()) onSelect(item);
                }}
                onPointerDown={(event) => sortable.onPointerDown(event, item.id)}
                onFocus={(event) => {
                  if (event.target === event.currentTarget && !selected) onSelect(item);
                }}
                onKeyDown={(event) => onRowKey(event, item, index)}
              >
                <Tooltip
                  tip={t("queue.grip")}
                  keys={[
                    [t("key.alt"), "↑"],
                    [t("key.alt"), "↓"],
                  ]}
                >
                  <span className="row__grip">
                    <Icon name="line.3.horizontal" size={14} />
                  </span>
                </Tooltip>
                <span className="row__prio">#{rank.get(item.id)}</span>
                <div className="row__main">
                  <div className="row__comment">
                    {item.comment.split("\n")[0] || <em>{t("queue.noComment")}</em>}
                  </div>
                  <div className="row__meta">
                    <span className="num">
                      {shortTimecode(itemTimecode(item, item.frameStart))}
                    </span>
                    {isRange && (
                      <>
                        <span className="row__sep">→</span>
                        <span className="num">
                          {shortTimecode(itemTimecode(item, item.frameEnd))}
                        </span>
                      </>
                    )}
                    <span className="row__sep">·</span>
                    <Tooltip tip={t(kindKey(item.kind))}>
                      <span>
                        <Icon name={kindIcon(item.kind)} size={12} />
                      </span>
                    </Tooltip>
                    <span>{t("unit.frames", { n: item.frameEnd - item.frameStart + 1 })}</span>
                    {needsVerification(item) && (
                      <Tooltip tip={t("queue.afterDotTip")}>
                        <span className="row__after" role="img" aria-label={t("queue.afterDot")} />
                      </Tooltip>
                    )}
                  </div>
                </div>
                <StatusTag status={item.status} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="queue__live" aria-live="polite" role="status">
        {announce}
      </div>
      <footer className="queue__foot">
        <span className="queue__summary">
          <Rich id="queue.summary" vars={{ todo: toDo, fixed: verifyCount(items) }} />
        </span>
        <div className="spacer" />
        <Tooltip
          tip={toDo === 0 ? t("queue.copyEmptyTip") : t("queue.copyTip")}
          keys={toDo === 0 ? undefined : [[t("key.shift"), "C"]]}
        >
          <Button
            variant="plain"
            icon="doc.on.doc"
            disabled={toDo === 0}
            aria-label={t("queue.copy")}
            onClick={() => onCopy("md")}
          >
            <span className="queue__copy-label">{t("queue.copy")}</span>
          </Button>
        </Tooltip>
        <Menu
          label={t("queue.copyMenu")}
          align="right"
          entries={copyEntries}
          trigger={(triggerProps) => (
            <Tooltip tip={t("queue.copyMenu")}>
              <IconButton
                icon="chevron.down"
                size="sm"
                label={t("queue.copyMenu")}
                {...triggerProps}
              />
            </Tooltip>
          )}
        />
      </footer>
    </section>
  );
}
