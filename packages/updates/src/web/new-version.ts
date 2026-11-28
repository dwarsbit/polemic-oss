/**
 * "A new version is available" in the browser: Polemic, Cursive and Binder on the web, and the
 * web home. Each build names itself in its page (`<meta name="scholarkit-build">`) and in a
 * `version.json` next to it (see `../vite.ts`). The page asks for that file now and then; a
 * different name means a newer build is served, and the notice shows until the person loads it
 * or puts it off with Later. Later holds until yet another build comes.
 *
 * Nothing here reloads the page: only the person's click does (`NewVersionCard`).
 */

import { BUILD_META, VERSION_FILE } from "../vite";

/** How often an open page asks while it stays in view. */
export const CHECK_EVERY_MS = 15 * 60_000;

export interface NewVersionDeps {
  /** The build this page runs, or null when it has none (a development build). */
  current: string | null;
  /** The name of the build being served now, or null when that can't be read. */
  served: () => Promise<string | null>;
}

export interface NewVersion {
  /** True while a newer build is served and the person hasn't put it off. */
  available(): boolean;
  /** Calls `listener` whenever `available()` may have changed. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Asks for the served build once. */
  check(): Promise<void>;
  /** Hides the notice until another build than the one served now comes. */
  later(): void;
  /** Checks now and then: every 15 minutes, and when the page comes back into view or online. */
  start(): void;
  stop(): void;
}

export function createNewVersion({ current, served }: NewVersionDeps): NewVersion {
  let latest: string | null = null;
  let putOff: string | null = null;
  let checking: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const stops: (() => void)[] = [];
  const emit = () => listeners.forEach((listener) => listener());

  const check = () => {
    if (!current) return Promise.resolve();
    checking ??= served()
      .then((build) => {
        if (build === null) return;
        // The build this page runs is served again, as after a rollback: nothing to load.
        const next = build === current ? null : build;
        if (next === latest) return;
        latest = next;
        emit();
      })
      .catch(() => {
        // Offline or the server busy: asked again later.
      })
      .finally(() => {
        checking = null;
      });
    return checking;
  };

  return {
    available: () => latest !== null && latest !== putOff,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    check,
    later() {
      putOff = latest;
      emit();
    },
    start() {
      if (!current || stops.length > 0) return;
      const timer = setInterval(() => {
        if (document.visibilityState === "visible") void check();
      }, CHECK_EVERY_MS);
      const onVisible = () => {
        if (document.visibilityState === "visible") void check();
      };
      const onOnline = () => void check();
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);
      stops.push(
        () => clearInterval(timer),
        () => document.removeEventListener("visibilitychange", onVisible),
        () => window.removeEventListener("online", onOnline),
      );
    },
    stop() {
      while (stops.length > 0) stops.pop()?.();
    },
  };
}

/** The build the page runs, from its `<meta name="scholarkit-build">`. */
export function pageBuild(doc: Document = document): string | null {
  return (
    doc.querySelector<HTMLMetaElement>(`meta[name="${BUILD_META}"]`)?.content || null
  );
}

/** Reads `version.json` past every cache, the CDN's included. */
export async function servedBuild(url: string): Promise<string | null> {
  const response = await fetch(`${url}?t=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { build?: unknown };
  return typeof body.build === "string" && body.build !== "" ? body.build : null;
}

/**
 * The watcher for a page served under `base` (`import.meta.env.BASE_URL`, such as `/cursive/`),
 * started. Null on a page without a build name: development builds and the desktop apps.
 */
export function watchNewVersion(base: string): NewVersion | null {
  const current = pageBuild();
  if (!current) return null;
  const url = `${base.endsWith("/") ? base : `${base}/`}${VERSION_FILE}`;
  const watcher = createNewVersion({ current, served: () => servedBuild(url) });
  watcher.start();
  return watcher;
}
