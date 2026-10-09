import classigo from "classigo";
import { useEffect, useRef, useState } from "react";
import type { Item, ItemStatus } from "../../core/types";
import { frameImageUrl, type ItemChanges } from "../api";
import { ageSince, captureTiles } from "../format";
import { formatTimecode } from "../frame";
import { Rich, useI18n } from "../i18n";
import {
  kindIcon,
  kindLabelKey,
  STATUSES,
  statusDescKey,
  statusIcon,
  statusLabelKey,
} from "../status";
import { Button, IconButton } from "../ui/Button";
import { Field, Textarea } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Lightbox } from "../ui/Lightbox";
import { Menu, type MenuEntry } from "../ui/Menu";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { Tooltip } from "../ui/Tooltip";

interface ItemDetailProps {
  item: Item | null;
  number: number;
  autoFocus: boolean;
  confirming: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onChange: (id: string, changes: ItemChanges) => Promise<boolean>;
  onDelete: (id: string) => void;
  onSeek: (frame: number) => void;
  onTyping: () => void;
  onLeaveComment: () => void;
}

type FormProps = Omit<ItemDetailProps, "item"> & { item: Item };

type Compare = "before" | "after";

const SAVED_FLASH_MS = 1400;

export function ItemDetail(props: ItemDetailProps) {
  const { t } = useI18n();
  const { item, ...rest } = props;
  if (!item) {
    return (
      <section className="detail" aria-label={t("detail.label")}>
        <div className="empty">{t("detail.empty")}</div>
      </section>
    );
  }
  return <ItemForm key={item.id} item={item} {...rest} />;
}

function ItemForm({
  item,
  number,
  autoFocus,
  confirming,
  onRequestDelete,
  onCancelDelete,
  onChange,
  onDelete,
  onSeek,
  onTyping,
  onLeaveComment,
}: FormProps) {
  const { t, lang } = useI18n();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const savedValue = useRef(item.comment);
  const flashTimer = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);

  const isRange = item.frameEnd > item.frameStart;
  const frames = item.frameEnd - item.frameStart + 1;
  const tiles = captureTiles(item);
  const startTc = formatTimecode(item.frameStart, item.fps);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area || document.activeElement === area) return;
    savedValue.current = item.comment;
    if (area.value !== item.comment) area.value = item.comment;
  }, [item.comment]);

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
      cancelRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [confirming]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const save = () => {
    const area = areaRef.current;
    if (!area || area.value === savedValue.current) return;
    const previous = savedValue.current;
    savedValue.current = area.value;
    void onChange(item.id, { comment: area.value }).then((ok) => {
      if (!ok) {
        savedValue.current = previous;
        return;
      }
      setFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(false), SAVED_FLASH_MS);
    });
  };

  const statusOptions: SegmentOption<ItemStatus>[] = STATUSES.map((status) => ({
    value: status,
    className: `s-${status}`,
    tip: t(statusDescKey(status)),
    content: (
      <>
        <Icon name={statusIcon(status)} size={13} />
        {t(statusLabelKey(status))}
      </>
    ),
  }));

  const compareOptions: SegmentOption<Compare>[] = [
    { value: "before", content: t("detail.before"), tip: t("detail.beforeTip") },
    { value: "after", content: t("detail.after"), tip: t("detail.afterTip"), disabled: true },
  ];

  const menuEntries: MenuEntry[] = [
    {
      type: "item",
      id: "copy",
      label: t("detail.copyTc"),
      icon: "doc.on.doc",
      onSelect: () => {
        void navigator.clipboard?.writeText(startTc).catch(() => undefined);
      },
    },
    {
      type: "item",
      id: "goto",
      label: t("detail.goTo"),
      icon: "scope",
      onSelect: () => onSeek(item.frameStart),
    },
    { type: "separator", id: "sep" },
    {
      type: "item",
      id: "delete",
      label: t("detail.delete"),
      icon: "trash",
      keys: [t("key.delete")],
      onSelect: onRequestDelete,
    },
  ];

  const age = ageSince(item.createdAt, Date.now());
  const ago = age
    ? new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(-age.value, age.unit)
    : t("detail.justNow");
  const number3 = new Intl.NumberFormat(lang, { maximumFractionDigits: 3 });

  return (
    <section className="detail" data-snav="container" aria-label={t("detail.label")}>
      <header className="detail__head">
        <div className="detail__main">
          <div className="detail__title">
            <span className="detail__prio">#{number}</span>
            <span className="detail__kind">
              <Icon name={kindIcon(item.kind)} size={14} />
              {t(kindLabelKey(item.kind, isRange))}
            </span>
          </div>
          <div className="detail__sub">
            {isRange ? (
              <>
                {item.frameStart} → {item.frameEnd}
                <span className="detail__sep">·</span>
                {t("unit.frames", { n: frames })}
              </>
            ) : (
              item.frameStart
            )}
            <br />
            {isRange ? `${startTc} → ${formatTimecode(item.frameEnd, item.fps)}` : startTc}
            {item.region && (
              <>
                <span className="detail__sep">·</span>
                <span className="detail__zone">
                  {t("detail.zone", {
                    w: number3.format(item.region.w),
                    h: number3.format(item.region.h),
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <Tooltip tip={t("detail.goTo")}>
          <IconButton
            icon="scope"
            label={t("detail.goTo")}
            onClick={() => onSeek(item.frameStart)}
          />
        </Tooltip>
        <Menu
          label={t("detail.more")}
          align="right"
          entries={menuEntries}
          trigger={(triggerProps) => (
            <Tooltip tip={t("detail.more")}>
              <IconButton icon="ellipsis" label={t("detail.more")} {...triggerProps} />
            </Tooltip>
          )}
        />
      </header>
      <div className="detail__body">
        <Field label={t("status.label")}>
          <SegmentedControl<ItemStatus>
            label={t("status.label")}
            variant="status"
            value={item.status}
            options={statusOptions}
            onChange={(status) => void onChange(item.id, { status })}
          />
        </Field>
        <Field
          className="detail__comment"
          htmlFor="comment"
          label={t("detail.comment")}
          aside={
            <span className={classigo("detail__saved", { "detail__saved--on": flash })}>
              <Icon name="checkmark" size={12} />
              {t("detail.saved")}
            </span>
          }
        >
          <Textarea
            id="comment"
            ref={areaRef}
            rows={3}
            defaultValue={item.comment}
            placeholder={t("detail.placeholder")}
            onInput={onTyping}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                save();
                onLeaveComment();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.value = savedValue.current;
                event.currentTarget.blur();
              }
            }}
          />
          <div className="detail__hint">
            <Rich id="detail.hint" vars={{ enter: t("key.enter"), shift: t("key.shift") }} />
          </div>
        </Field>
        {item.agentNote && (
          <div className="detail__note">
            <Icon name="robot" size={16} />
            <div>
              <small>{t("detail.note")}</small>
              {item.agentNote}
            </div>
          </div>
        )}
        {tiles.length > 0 && (
          <Field
            label={t("detail.captures")}
            aside={
              <SegmentedControl<Compare>
                label={t("detail.compare")}
                variant="mini"
                value="before"
                options={compareOptions}
                onChange={() => undefined}
              />
            }
          >
            <div className="caps">
              {tiles.map((tile) => (
                <Tooltip
                  key={tile.image}
                  tip={
                    tile.sheet
                      ? t("cap.sheetTip", { a: item.frameStart, b: item.frameEnd })
                      : t("cap.seek", { n: tile.frame ?? 0 })
                  }
                >
                  <button
                    type="button"
                    className="cap"
                    onClick={() => {
                      if (tile.sheet) setSheet(tile.image);
                      else if (tile.frame !== null) onSeek(tile.frame);
                    }}
                  >
                    <span className="cap__img">
                      <img src={frameImageUrl(tile.image)} alt="" loading="lazy" />
                    </span>
                    <span className="cap__cap">
                      <b>{t(tile.label)}</b>
                      <span className="num">{tile.sheet ? "3×3" : tile.frame}</span>
                    </span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </Field>
        )}
        <div className="detail__foot">{t("detail.added", { ago })}</div>
        {confirming && (
          <div
            className="confirm"
            role="alertdialog"
            aria-label={t("detail.confirm", { n: number })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancelDelete();
              }
            }}
          >
            <span>{t("detail.confirm", { n: number })}</span>
            <div className="spacer" />
            <Button ref={cancelRef} variant="plain" onClick={onCancelDelete}>
              {t("detail.cancel")}
            </Button>
            <Button icon="trash" onClick={() => onDelete(item.id)}>
              {t("detail.confirmDelete")}
            </Button>
          </div>
        )}
      </div>
      {sheet && (
        <Lightbox
          src={frameImageUrl(sheet)}
          alt={t("cap.sheetTitle")}
          title={t("cap.sheetTitle")}
          closeLabel={t("cap.close")}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
