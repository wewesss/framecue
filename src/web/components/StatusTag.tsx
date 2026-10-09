import classigo from "classigo/lite";
import type { ItemStatus } from "../../core/types";
import { useT } from "../i18n";
import { statusClass, statusIcon, statusLabelKey } from "../status";
import { Icon } from "../ui/Icon";

export function StatusTag({ status }: { status: ItemStatus }) {
  const t = useT();
  return (
    <span className={classigo("st-tag", statusClass(status))}>
      <Icon name={statusIcon(status)} size={13} />
      {t(statusLabelKey(status))}
    </span>
  );
}
