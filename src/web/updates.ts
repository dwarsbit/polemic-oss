/**
 * The browser build's stand-in for `@scholarkit/updates/tauri`. The browser always loads the
 * latest version, so there is nothing to update, and `lib/updates.ts` makes no updater.
 */

export function desktopUpdater(): never {
  throw new Error("The browser build has no updater.");
}
