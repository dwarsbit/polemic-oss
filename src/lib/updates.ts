import { desktopUpdater } from "@scholarkit/updates/tauri";
import { isWeb } from "@/lib/target";

/**
 * The desktop app's updater: checks for a new version and installs it. Null in the browser
 * build, and in the desktop build run in a plain browser during development.
 */
export const updater =
  !isWeb && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? desktopUpdater()
    : null;

/** Where a new version can be downloaded by hand, when it couldn't be installed. */
export const DOWNLOAD_URL = "https://scholarkit.app/download";
