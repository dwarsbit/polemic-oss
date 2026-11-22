import { t } from "@scholarkit/i18n";
import { statusText, useUpdates } from "../use-updates";
import type { Updater } from "../updates";
import { BUTTON } from "./UpdateCard";

/**
 * Updates in Settings: the automatic check, the installed version, what the last check found
 * and Check now. Polemic builds the same rows in its own settings layout from useUpdates and
 * statusText.
 */
export function UpdatesSettings({ updater, app }: { updater: Updater; app: string }) {
  const state = useUpdates(updater);
  const busy =
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "installing";

  return (
    <section className="mt-5" aria-labelledby="updates-settings-title">
      <h2
        id="updates-settings-title"
        className="mb-2 text-xs font-medium text-muted-foreground"
      >
        {t("Updates")}
      </h2>
      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 size-3.5 accent-[var(--tint)]"
          checked={state.auto}
          onChange={(event) => updater.setAuto(event.target.checked)}
        />
        <span>
          {t("Check for updates automatically")}
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t(
              "{app} checks when it starts and once a day, and downloads a new version in the background. It asks before it restarts.",
              { app },
            )}
          </span>
        </span>
      </label>
      <div className="mt-3 flex items-center gap-3 border-t pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px]">
            {app} {state.current ?? ""}
          </p>
          <p className="text-xs text-muted-foreground" role="status">
            {statusText(state, app)}
          </p>
        </div>
        {state.phase === "ready" ? (
          <button
            type="button"
            className={BUTTON}
            onClick={() => void updater.restart()}
          >
            {t("Restart now")}
          </button>
        ) : (
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => void updater.check({ manual: true })}
          >
            {t("Check now")}
          </button>
        )}
      </div>
    </section>
  );
}
