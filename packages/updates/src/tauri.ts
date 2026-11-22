// The updater of a desktop app, on Tauri's updater and process plugins. The update server and
// the public key that checks each download's signature are in the app's tauri.conf.json.

import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { createUpdater, type FoundUpdate, type Updater } from "./updates";

/** A check that hears nothing back in this time counts as failed. */
const CHECK_TIMEOUT_MS = 30_000;

async function findUpdate(): Promise<FoundUpdate | null> {
  const update = await check({ timeout: CHECK_TIMEOUT_MS });
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? "",
    date: update.date ?? null,
    async download(onProgress) {
      let total: number | null = null;
      let done = 0;
      await update.download((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          onProgress(total ? 0 : null);
        } else if (event.event === "Progress") {
          done += event.data.chunkLength;
          onProgress(total ? Math.min(done / total, 1) : null);
        }
      });
    },
    install: () => update.install(),
  };
}

export interface DesktopUpdater extends Updater {
  /**
   * What saves the open project before a restart. Returns a function that removes it again,
   * for when the project closes.
   */
  saveWith(save: () => Promise<void>): () => void;
}

/** The app's updater. Make it once, in the desktop app only. */
export function desktopUpdater(): DesktopUpdater {
  let save: (() => Promise<void>) | null = null;
  const updater = createUpdater({
    currentVersion: getVersion,
    check: findUpdate,
    relaunch,
    beforeRestart: async () => {
      await save?.();
    },
  });
  return {
    ...updater,
    saveWith(next) {
      save = next;
      return () => {
        if (save === next) save = null;
      };
    },
  };
}
