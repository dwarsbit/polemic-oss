import { useSyncExternalStore } from "react";
import { formatDate, t } from "@scholarkit/i18n";
import type { Updater, UpdatesState } from "./updates";

/** The updater's state, kept current. */
export function useUpdates(updater: Updater): UpdatesState {
  return useSyncExternalStore(updater.subscribe, updater.state, updater.state);
}

/**
 * The line under the installed version in Settings: what the last check found, or what is
 * happening now.
 */
export function statusText(state: UpdatesState, app: string, now = new Date()): string {
  switch (state.phase) {
    case "checking":
      return t("Checking for updates…");
    case "downloading":
      return t("Downloading {app} {version}…", { app, version: state.update?.version });
    case "ready":
      return t("{app} {version} is ready. Restart {app} to install it.", {
        app,
        version: state.update?.version,
      });
    case "installing":
      return t("Installing {app} {version}…", { app, version: state.update?.version });
    case "check-failed":
      return t(
        "Couldn’t check for updates. Check your internet connection and try again.",
      );
    case "install-failed":
      return t(
        "The update couldn’t be installed. Download the new version from scholarkit.app.",
      );
    case "idle":
      if (state.checkedAt === null) return t("Not checked yet.");
      return t("You have the latest version. Checked {when}.", {
        when: checkedAt(state.checkedAt, now),
      });
  }
}

/**
 * "today at 21:40", "yesterday at 09:05" or "on Nov 18 at 14:00", in the person's own time
 * and the interface language.
 */
export function checkedAt(time: number, now = new Date()): string {
  const date = new Date(time);
  const day = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  const clock = formatDate(date, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 0) return t("today at {time}", { time: clock });
  if (days === 1) return t("yesterday at {time}", { time: clock });
  return t("on {date} at {time}", {
    date: formatDate(date, { month: "short", day: "numeric" }),
    time: clock,
  });
}
