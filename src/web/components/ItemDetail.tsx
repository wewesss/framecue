import classigo from "classigo";
import { useEffect, useRef, useState } from "react";
import type { Item, ItemStatus } from "../../core/types";
import { frameImageUrl, type ItemChanges } from "../api";
import { ageSince, captureTiles } from "../format";
import { itemTimecode } from "../frame";
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
import { Kbd } from "../ui/Kbd";
import { Lightbox } from "../ui/Lightbox";
import { Menu, type MenuEntry } from "../ui/Menu";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { Tooltip } from "../ui/Tooltip";

interface ItemDetailProps {
  item: Item | null;
  number: number;
  autoFocus: boolean;
  batchDone: boolean;
  confirming: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onChange: (id: string, changes: ItemChanges) => Promise<boolean>;
  onDelete: (id: string) => void;
  onSeek: (frame: number) => void;
  onVerify: (id: string) => void;
  onReopen: (id: string) => void;
  onRecapture: (id: string) => Promise<boolean>;
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
  batchDone,
  confirming,
  onRequestDelete,
  onCancelDelete,
  onChange,
  onDelete,
  onSeek,
  onVerify,
  onReopen,
  onRecapture,
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
  const [view, setView] = useState<Compare>(item.after ? "after" : "before");
  const [picked, setPicked] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [recapturing, setRecapturing] = useState(false);
  const afterSha = item.after?.sha256;

  const isRange = item.frameEnd > item.frameStart;
  const frames = item.frameEnd - item.frameStart + 1;
  const shown: Compare = item.after ? view : "before";
  const tiles = captureTiles(
    shown === "after" && item.after ? { ...item, images: item.after.images } : item,
  );
  const baseName = (image: string) => image.split("/").pop() ?? image;
  const pickedName =
    picked !== null && tiles.some((tile) => baseName(tile.image) === picked)
      ? picked
      : baseName(tiles[0]?.image ?? "");
  const pickedTile = tiles.find((tile) => baseName(tile.image) === pickedName);
  const beforeImage = item.images.find((image) => baseName(image) === pickedName);
  const afterImage = item.after?.images.find((image) => baseName(image) === pickedName);
  const awaitingVerdict = item.status === "fixed" && item.after != null;
  const startTc = itemTimecode(item, item.frameStart);

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

  useEffect(() => {
    if (afterSha) setView("after");
  }, [afterSha]);

  const recapture = () => {
    setRecapturing(true);
    void onRecapture(item.id).finally(() => setRecapturing(false));
  };

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
    {
      value: "after",
      content: t("detail.after"),
      tip: item.after ? t("detail.afterTip") : t("detail.afterNoneTip"),
      disabled: !item.after,
    },
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
            {isRange ? `${startTc} → ${itemTimecode(item, item.frameEnd)}` : startTc}
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
        {awaitingVerdict && (
          <fieldset className="verify" aria-label={t("verify.label")}>
            <Tooltip tip={t("verify.verifiedTip")} keys={[["V"]]}>
              <Button
                variant="primary"
                icon="checkmark.circle"
                className="verify__btn"
                onClick={() => onVerify(item.id)}
              >
                {t("verify.verified")}
                <Kbd>V</Kbd>
              </Button>
            </Tooltip>
            <Tooltip tip={t("verify.reopenTip")} keys={[["X"]]}>
              <Button
                icon="arrow.counterclockwise"
                className="verify__btn"
                onClick={() => onReopen(item.id)}
              >
                {t("verify.reopen")}
                <Kbd>X</Kbd>
              </Button>
            </Tooltip>
          </fieldset>
        )}
        {!awaitingVerdict && batchDone && (
          <div className="verify verify--done" role="status">
            <Icon name="checkmark.circle" size={16} />
            <div>
              <b>{t("verify.done")}</b>
              <span>{t("verify.doneBody")}</span>
            </div>
          </div>
        )}
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
                value={shown}
                options={compareOptions}
                onChange={setView}
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
                    className={classigo("cap", {
                      "cap--on": item.after != null && baseName(tile.image) === pickedName,
                    })}
                    onClick={() => {
                      setPicked(baseName(tile.image));
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
            <div className="caps__foot">
              {shown === "after" && item.after ? (
                <span className="caps__meta">
                  {t("detail.afterMeta", {
                    sha: item.after.sha256.slice(0, 8),
                    time: new Date(item.after.capturedAt).toLocaleTimeString(lang, {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  })}
                </span>
              ) : (
                <span />
              )}
              {item.after ? (
                <Tooltip tip={t("detail.compareTip")}>
                  <Button
                    variant="plain"
                    icon="arrow.up.left.and.arrow.down.right"
                    onClick={() => setComparing(true)}
                  >
                    {t("detail.compareOpen")}
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip tip={t("detail.recaptureTip")}>
                  <Button variant="plain" icon="photo" disabled={recapturing} onClick={recapture}>
                    {recapturing ? t("detail.recapturing") : t("detail.recapture")}
                  </Button>
                </Tooltip>
              )}
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
      {comparing && beforeImage && afterImage && pickedTile && (
        <Lightbox
          compare={{
            before: frameImageUrl(beforeImage),
            after: frameImageUrl(afterImage),
            labels: {
              before: t("detail.before"),
              after: t("detail.after"),
              mode: t("compare.mode"),
              side: t("compare.side"),
              wipe: t("compare.wipe"),
              slider: t("compare.slider"),
            },
          }}
          alt={t("compare.title", { label: t(pickedTile.label) })}
          title={t("compare.title", { label: t(pickedTile.label) })}
          closeLabel={t("cap.close")}
          onClose={() => setComparing(false)}
        />
      )}
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
