import { statusText, useUpdates } from "@scholarkit/updates/use-updates";
import type { Updater } from "@scholarkit/updates/updates";
import { SettingsRow } from "@/components/SettingsRow";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { t } from "@scholarkit/i18n";

/** Settings → Updates: the automatic check, the installed version and Check now. */
export function UpdatesSettingsSection({ updater }: { updater: Updater }) {
  const state = useUpdates(updater);
  const busy =
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "installing";

  return (
    <section className="rounded-xl border bg-card px-4 py-3 shadow-xs">
      <p className="mb-2 text-sm font-medium">{t("Updates")}</p>
      <div className="divide-y divide-border">
        <SettingsRow
          label={t("Check for updates automatically")}
          description={t(
            "{app} checks when it starts and once a day, and downloads a new version in the background. It asks before it restarts.",
            { app: "Polemic" },
          )}
          control={
            <Switch
              checked={state.auto}
              onCheckedChange={(on) => updater.setAuto(on)}
              aria-label={t("Check for updates automatically")}
            />
          }
        />
        <SettingsRow
          // The name and version, the same in every language.
          // eslint-disable-next-line scholarkit/no-literal-text
          label={`Polemic ${state.current ?? ""}`}
          description={<span role="status">{statusText(state, "Polemic")}</span>}
          control={
            state.phase === "ready" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void updater.restart()}
              >
                {t("Restart now")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void updater.check({ manual: true })}
              >
                {t("Check now")}
              </Button>
            )
          }
        />
      </div>
    </section>
  );
}
