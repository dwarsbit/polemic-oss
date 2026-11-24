// Error reports to Sentry, through the Scholarkit API's tunnel (see packages/monitoring). Off
// without VITE_SENTRY_DSN, so a build from the public repository sends nothing. The browser build
// always reports; the desktop app reports unless "Send error reports" is off in Settings, and
// also sends a panic of its Rust side at the next start (src-tauri/src/crash.rs).

import { getSettings, takeLastCrash } from "@/lib/tauri";
import { isWeb } from "@/lib/target";

const dsn = import.meta.env.VITE_SENTRY_DSN;

/** Whether this build can send error reports, and so shows the setting. */
export const reportsBuiltIn = Boolean(dsn);
/** The browser build reports to its own server; the desktop app to the hosted one. */
const tunnel =
  import.meta.env.VITE_SENTRY_TUNNEL ||
  (isWeb ? "/api/monitoring" : "https://app.scholarkit.app/api/monitoring");

/** The SDK, loaded only when reports are on. */
let monitoring: Promise<typeof import("@scholarkit/monitoring/browser")> | undefined;

function load() {
  monitoring ??= import("@scholarkit/monitoring/browser").then((m) => {
    m.startBrowserMonitoring({
      dsn,
      tunnel,
      app: "polemic",
      platform: isWeb ? "web" : "desktop",
      release: `polemic@${__APP_VERSION__}`,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "production",
    });
    return m;
  });
  return monitoring;
}

/** Starts error reporting when this build and the user's settings allow it. */
export async function startMonitoring(): Promise<void> {
  if (!dsn) return;
  if (isWeb) {
    await load();
    return;
  }
  const settings = await getSettings().catch(() => null);
  if (settings?.errorReports === false) return;
  const m = await load();
  const crash = await takeLastCrash().catch(() => null);
  if (crash) {
    const error = new Error(crash.message);
    error.name = "Panic";
    m.reportError(error, {
      source: "rust",
      location: crash.location ?? "unknown",
      crashed_version: crash.version,
    });
  }
}

/** The "Send error reports" setting changed: start reporting, or hold every report back. */
export async function setErrorReports(enabled: boolean): Promise<void> {
  if (!dsn) return;
  const m = enabled ? await load() : await monitoring;
  m?.allowReports(enabled);
}
