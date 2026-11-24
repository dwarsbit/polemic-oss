import React from "react";
import ReactDOM from "react-dom/client";
import { startLanguage } from "@scholarkit/i18n";
import { catalogs } from "@/lib/languages";
import { startMonitoring } from "@/lib/monitoring";
import { hasTrafficLights } from "@/lib/platform";
import { isWeb } from "@/lib/target";
import "./index.css";

// The macOS desktop app: the window uses the system vibrancy material
// (see lib.rs and the html.mac overrides in index.css).
if (hasTrafficLights) document.documentElement.classList.add("mac");

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// Dev builds only: `?lab` opens the Design Lab (prototypes of the shell,
// settings, typography, menus and copy) instead of the app. The guard
// lets the bundler drop the lab from release builds entirely.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("lab")) {
  void import("./lab/Lab").then(({ Lab }) =>
    root.render(
      <React.StrictMode>
        <Lab />
      </React.StrictMode>,
    ),
  );
} else {
  void start();
}

/**
 * The language comes first: the app's modules translate their text as they
 * load, so they load once it is set.
 */
async function start() {
  void startMonitoring();
  await startLanguage({ loaders: catalogs, dev: import.meta.env.DEV });
  const [{ default: App }, { translateMenus }, { updater }, { useProjectStore }] =
    await Promise.all([
      import("./App"),
      import("@/lib/menu-labels"),
      import("@/lib/updates"),
      import("@/store/project"),
    ]);
  if (isWeb) {
    // The browser build shows nothing until it knows who is signed in:
    // signed out goes to the sign-in page.
    const { startWeb } = await import("./web/start");
    await startWeb(root, <App />);
    return;
  }
  void translateMenus();
  // The desktop app checks for a new version soon after it starts, and once a day after that;
  // development builds only check from Settings. A restart to install it saves the open files
  // first, as closing the window does.
  updater?.saveWith(() => useProjectStore.getState().flushBuffers());
  if (import.meta.env.PROD) updater?.start();
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
