/**
 * "A new version is available" in the browser build (`@scholarkit/updates/web`). Load new
 * version writes every edit still on its way first: the session (src/web/session.ts) says how.
 */

import { watchNewVersion } from "@scholarkit/updates/web/new-version";
import { isWeb } from "@/lib/target";

/** Null in the desktop app and in development builds, which have no build name. */
export const newVersion = isWeb ? watchNewVersion(import.meta.env.BASE_URL) : null;

let save: (() => Promise<void>) | null = null;

/** What to write before the page reloads to load a new version. Returns the undo. */
export function saveBeforeReloadWith(next: () => Promise<void>): () => void {
  save = next;
  return () => {
    if (save === next) save = null;
  };
}

/** Writes the open project's edits, before the page reloads to load a new version. */
export async function saveBeforeReload(): Promise<void> {
  await save?.();
}
