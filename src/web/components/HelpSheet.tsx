import classigo from "classigo";
import { Fragment, type ReactNode, useEffect, useRef } from "react";
import { Rich, type TKey, useT } from "../i18n";
import { STATUSES, statusDescKey, statusIcon, statusLabelKey } from "../status";
import { IconButton } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { Tooltip } from "../ui/Tooltip";

interface HelpSheetProps {
  open: boolean;
  onClose: () => void;
}

type Combo = readonly string[];

function Combos({ of }: { of: readonly Combo[] }) {
  return (
    <>
      {of.map((combo) => (
        <Fragment key={combo.join("+")}>
          {combo.map((key, index) => (
            <Fragment key={key}>
              {index > 0 && <span className="plus">+</span>}
              <Kbd>{key}</Kbd>
            </Fragment>
          ))}{" "}
        </Fragment>
      ))}
    </>
  );
}

function Row({ lead, desc, note }: { lead: ReactNode; desc: string; note?: string }) {
  return (
    <tr>
      <td>{lead}</td>
      <td>
        {desc}
        {note && <small>{note}</small>}
      </td>
    </tr>
  );
}

function Group({ title }: { title: string }) {
  return (
    <tr className="group">
      <td colSpan={2}>{title}</td>
    </tr>
  );
}

const TABS: { id: string; label: TKey }[] = [
  { id: "h-keys", label: "help.tab.keys" },
  { id: "h-flow", label: "help.tab.flow" },
  { id: "h-status", label: "help.tab.status" },
  { id: "h-agent", label: "help.tab.agent" },
];

const STEPS: { title: TKey; body: TKey }[] = [
  { title: "help.step1.title", body: "help.step1.body" },
  { title: "help.step2.title", body: "help.step2.body" },
  { title: "help.step3.title", body: "help.step3.body" },
  { title: "help.step4.title", body: "help.step4.body" },
];

const AGENT_CARDS: { icon: IconName; title: TKey; body: TKey }[] = [
  { icon: "folder", title: "help.agent.files", body: "help.agent.filesBody" },
  { icon: "doc.on.doc", title: "help.agent.clipboard", body: "help.agent.clipboardBody" },
  {
    icon: "point.3.connected.trianglepath.dotted",
    title: "help.agent.mcp",
    body: "help.agent.mcpBody",
  },
];

export function HelpSheet({ open, onClose }: HelpSheetProps) {
  const t = useT();
  const sheet = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      sheet.current?.focus();
    } else if (returnTo.current) {
      returnTo.current.focus();
      returnTo.current = null;
    }
  }, [open]);

  const space = t("key.space");
  const shift = t("key.shift");
  const alt = t("key.alt");
  const enter = t("key.enter");
  const esc = t("key.esc");

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start" });

  return (
    <>
      <button
        type="button"
        className={classigo("scrim", { "scrim--open": open })}
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={sheet}
        className={classigo("help", { "help--open": open })}
        aria-label={t("help.title")}
        aria-hidden={!open}
        data-native-keys=""
        inert={!open}
        tabIndex={-1}
      >
        <header className="help__head">
          <Icon name="questionmark.circle" />
          <h2 className="help__title">{t("help.title")}</h2>
          <div className="spacer" />
          <Tooltip tip={t("help.close")} keys={[esc]}>
            <IconButton icon="xmark" label={t("help.close")} onClick={onClose} />
          </Tooltip>
        </header>
        <nav className="help__tabs" aria-label={t("help.sections")}>
          {TABS.map((tab) => (
            <button key={tab.id} type="button" className="help__tab" onClick={() => jump(tab.id)}>
              {t(tab.label)}
            </button>
          ))}
        </nav>
        <div className="help__body">
          <h3 id="h-keys">
            <Icon name="keyboard" />
            {t("help.keys")}
          </h3>
          <table className="keys">
            <tbody>
              <Group title={t("help.group.playback")} />
              <Row lead={<Combos of={[[space]]} />} desc={t("help.play")} />
              <Row
                lead={<Combos of={[["←"], ["→"]]} />}
                desc={t("help.step")}
                note={t("help.stepNote")}
              />
              <Row
                lead={<Combos of={[[","], ["."]]} />}
                desc={t("help.step")}
                note={t("help.stepAnywhere")}
              />
              <Row
                lead={<Combos of={[[shift, "←"], ["→"]]} />}
                desc={t("help.step10")}
                note={t("help.stepAnywhere")}
              />
              <Row
                lead={<Combos of={[[t("key.home")], [t("key.end")]]} />}
                desc={t("help.firstLast")}
              />
              <Group title={t("help.group.selection")} />
              <Row lead={<Combos of={[["I"], ["O"]]} />} desc={t("help.inOut")} />
              <Row
                lead={<Combos of={[["R"]]} />}
                desc={t("help.region")}
                note={t("help.regionNote")}
              />
              <Row lead={<Combos of={[[enter]]} />} desc={t("help.add")} />
              <Row lead={<Combos of={[[esc]]} />} desc={t("help.clear")} />
              <Group title={t("help.group.stage")} />
              <Row
                lead={
                  <>
                    <Combos of={[["Ctrl"]]} />
                    <span className="plus">+</span>
                    {t("help.stageWheel")}
                  </>
                }
                desc={t("help.stageZoom")}
                note={t("help.stageZoomNote")}
              />
              <Row
                lead={t("help.stageDrag")}
                desc={t("help.stageDragDesc")}
                note={t("help.stageDragNote")}
              />
              <Group title={t("help.group.timeline")} />
              <Row lead={t("help.clickDrag")} desc={t("help.clickDragDesc")} />
              <Row lead={t("help.wheel")} desc={t("help.wheelDesc")} />
              <Row
                lead={
                  <>
                    <Combos of={[[shift]]} />
                    <span className="plus">+</span>
                    {t("help.shiftWheel")}
                  </>
                }
                desc={t("help.shiftWheelDesc")}
                note={t("help.shiftWheelNote")}
              />
              <Row lead={<Combos of={[["+"], ["-"]]} />} desc={t("help.zoom")} />
              <Row lead={<Combos of={[[shift, "Z"]]} />} desc={t("help.fit")} />
              <Row
                lead={
                  <>
                    <Combos of={[[shift]]} />
                    <span className="plus">+</span>
                    {t("help.shiftDrag")}
                  </>
                }
                desc={t("help.shiftDragDesc")}
              />
              <Row lead={t("help.brackets")} desc={t("help.bracketsDesc")} />
              <Row lead={<Combos of={[["S"]]} />} desc={t("help.snap")} note={t("help.snapNote")} />
              <Row
                lead={
                  <>
                    <Combos of={[[alt]]} />
                    {t("help.altDrag")}
                  </>
                }
                desc={t("help.altDragDesc")}
              />
              <Row
                lead={
                  <>
                    {t("help.longPress")} <small>~300 ms</small>
                  </>
                }
                desc={t("help.longPressDesc")}
                note={t("help.longPressNote")}
              />
              <Row lead={t("help.topEdge")} desc={t("help.topEdgeDesc")} />
              <Group title={t("help.group.nav")} />
              <Row
                lead={<Combos of={[["↑"], ["↓"], ["←"], ["→"]]} />}
                desc={t("help.focusMove")}
                note={t("help.focusMoveNote")}
              />
              <Row
                lead={<Combos of={[["↑"], ["↓"]]} />}
                desc={t("help.selectRow")}
                note={t("help.selectRowNote")}
              />
              <Row lead={<Combos of={[[alt, "↑"], ["↓"]]} />} desc={t("help.reorder")} />
              <Row lead={<Combos of={[[t("key.delete")]]} />} desc={t("help.deleteItem")} />
              <Row
                lead={
                  <>
                    <Combos of={[[enter]]} />
                    <small>{t("help.inComment")}</small>
                  </>
                }
                desc={t("help.commentSave")}
              />
              <Row lead={<Combos of={[[shift, enter]]} />} desc={t("help.commentNewline")} />
              <Row
                lead={
                  <>
                    <Combos of={[[esc]]} />
                    <small>{t("help.inComment")}</small>
                  </>
                }
                desc={t("help.commentEsc")}
              />
              <Row lead={<Combos of={[["?"]]} />} desc={t("help.toggle")} />
            </tbody>
          </table>

          <h3 id="h-flow">
            <Icon name="arrow.counterclockwise" />
            {t("help.flow")}
          </h3>
          <ol className="steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="n">{index + 1}</span>
                <div>
                  <b>{t(step.title)}</b>
                  <span>
                    <Rich id={step.body} vars={{ enter }} />
                  </span>
                </div>
              </li>
            ))}
          </ol>

          <h3 id="h-status">
            <Icon name="circle" />
            {t("help.status")}
          </h3>
          <div className="stlist">
            {STATUSES.map((status) => (
              <div key={status}>
                <span className={`status-pill s-${status}`}>
                  <Icon name={statusIcon(status)} size={12} />
                  {t(statusLabelKey(status))}
                </span>
                <span>{t(statusDescKey(status))}</span>
              </div>
            ))}
            <div>
              <span />
              <span>{t("help.statusAny")}</span>
            </div>
          </div>

          <h3 id="h-agent">
            <Icon name="robot" />
            {t("help.agent")}
          </h3>
          <div className="out">
            {AGENT_CARDS.map((card) => (
              <div key={card.title}>
                <Icon name={card.icon} size={16} />
                <span>
                  <b>{t(card.title)}</b>
                  <Rich id={card.body} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
