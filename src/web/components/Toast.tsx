import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";

export interface ToastData {
  id: number;
  verify: number;
  skipped: number;
  timing: { from: string; to: string } | null;
  notice: string | null;
}

interface ToastProps {
  data: ToastData;
  onSee: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 12_000;
const NOTICE_DISMISS_MS = 5000;

export function Toast({ data, onSee, onDismiss }: ToastProps) {
  const t = useT();
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const sticky = data.timing !== null;

  useEffect(() => {
    if (sticky) return;
    const delay = data.notice !== null ? NOTICE_DISMISS_MS : AUTO_DISMISS_MS;
    const handle = window.setTimeout(() => dismiss.current(), delay);
    return () => window.clearTimeout(handle);
  }, [sticky, data.notice]);

  if (data.notice !== null) {
    return (
      <div className="toast" role="status">
        <Icon name="checkmark.circle" size={16} className="toast__icon" />
        <div className="toast__text">
          <span>{data.notice}</span>
        </div>
        <IconButton icon="xmark" size="sm" label={t("toast.dismiss")} onClick={onDismiss} />
      </div>
    );
  }

  return (
    <div className="toast" role={sticky ? "alert" : "status"}>
      <Icon
        name={sticky ? "exclamationmark.triangle" : "film"}
        size={16}
        className={sticky ? "toast__icon toast__icon--warn" : "toast__icon"}
      />
      <div className="toast__text">
        <span>
          <b>{t("toast.render")}</b>
          {data.verify > 0 && (
            <>
              {" · "}
              {data.verify === 1
                ? t("toast.toVerifyOne")
                : t("toast.toVerifyMany", { n: data.verify })}
            </>
          )}
        </span>
        {data.skipped > 0 && (
          <small>
            {data.skipped === 1
              ? t("toast.skippedOne")
              : t("toast.skippedMany", { n: data.skipped })}
          </small>
        )}
        {data.timing && (
          <small className="toast__warn">
            {t("toast.timing", { from: data.timing.from, to: data.timing.to })}
          </small>
        )}
      </div>
      {data.verify > 0 && (
        <Button variant="primary" onClick={onSee}>
          {t("toast.see")}
        </Button>
      )}
      <IconButton icon="xmark" size="sm" label={t("toast.dismiss")} onClick={onDismiss} />
    </div>
  );
}
