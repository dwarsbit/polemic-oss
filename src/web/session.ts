/**
 * What the browser build adds around the editor: the address follows
 * the open project (`/polemic/projects/<id>`), edits save as you type,
 * and changes from others reach the open file. Started once by App.
 */

import { saveAsYouType } from "@/lib/save-as-you-type";
import { useCommentsStore } from "@/store/comments";
import { startPresence } from "@/web/presence";
import { useProjectStore } from "@/store/project";
import {
  closeProject,
  hasUnsyncedChanges,
  onProjectChange,
  projectIdOf,
} from "@/web/projects";

/** Where the browser build is served: "/polemic". */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** The list of projects, as a path next to the projects' own (`/projects/<id>`). */
const LIST = "/projects";

/**
 * The address of a project's path, or of the list of projects: the path under where the app is
 * served, so `/projects/<id>` is at `/polemic/projects/<id>`.
 */
export const addressOf = (path: string | null, base = BASE): string =>
  base + (path ?? LIST);

/** The path of the project an address names, or null: for the list and for anything else. */
export function projectPathIn(address: string, base = BASE): string | null {
  if (!address.startsWith(`${base}/`)) return null;
  const path = address.slice(base.length).replace(/\/+$/, "");
  return projectIdOf(path) ? path : null;
}

/** The project the address names, to open at startup. */
export function projectFromAddress(): string | null {
  return projectPathIn(window.location.pathname);
}

/**
 * How long edits gather before they are saved: short enough that others
 * see your typing as it happens, long enough to send a burst of keys at
 * once.
 */
const SAVE_DELAY_MS = 100;

export function startWebSession(): () => void {
  const stops: (() => void)[] = [];

  // The list of projects has one address, whichever way the page was reached (/polemic/).
  if (projectFromAddress() === null && window.location.pathname !== addressOf(null))
    window.history.replaceState(null, "", addressOf(null) + window.location.search);

  // Who else is in the project, and where.
  stops.push(startPresence());

  // Changes from others: reload the file tree and the open file, and
  // the comments when theirs (or a reviewer's) changed.
  stops.push(
    onProjectChange((change) => {
      void useProjectStore.getState().syncFromDisk();
      if (change.comments) void useCommentsStore.getState().load();
    }),
  );

  // Saving as you type (src/lib/save-as-you-type.ts).
  const saving = saveAsYouType(() => true, SAVE_DELAY_MS);
  stops.push(saving.stop);

  // The address and the tab title follow the open project.
  stops.push(
    useProjectStore.subscribe((state, previous) => {
      if (state.project?.path === previous.project?.path) return;
      const want = addressOf(state.project?.path ?? null);
      if (window.location.pathname !== want) window.history.pushState(null, "", want);
      document.title = state.project ? `${state.project.name} · Polemic` : "Polemic";
      if (!state.project) closeProject();
    }),
  );
  const onPopState = () => {
    const path = projectFromAddress();
    const store = useProjectStore.getState();
    if (path === (store.project?.path ?? null)) return;
    if (path) void store.openProject(path).catch(() => undefined);
    else void store.leaveProject();
  };
  window.addEventListener("popstate", onPopState);
  stops.push(() => window.removeEventListener("popstate", onPopState));

  // Edits still on their way to the server: ask before the tab closes.
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (saving.pending() || hasUnsyncedChanges()) event.preventDefault();
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  stops.push(() => window.removeEventListener("beforeunload", onBeforeUnload));

  return () => {
    for (const stop of stops) stop();
  };
}
