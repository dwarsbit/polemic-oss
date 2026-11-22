// Updates for the desktop apps. The app checks for a new version when it starts and once a day
// after that, downloads it in the background, and shows "Update ready" once it's on the disk.
// Nothing installs until the person chooses Restart now: the app then saves, installs and starts
// again. Later hides the card until the next start, when the app finds the version again.
//
// This file holds the logic and no Tauri or React, so it can be tested with fakes. tauri.ts
// connects it to the updater and process plugins, and use-updates.ts to React.

/** A new version, found and not downloaded yet. */
export interface FoundUpdate {
  version: string;
  /** The version's changelog section, in Markdown. Empty when the release has none. */
  notes: string;
  /** When it was released, as an ISO date, or null. */
  date: string | null;
  /** Downloads it and checks its signature. Reports the share downloaded, from 0 to 1, when known. */
  download(onProgress: (share: number | null) => void): Promise<void>;
  /** Installs what download() fetched. On Windows the installer takes over and the app quits. */
  install(): Promise<void>;
}

export interface UpdaterDeps {
  /** The installed version. */
  currentVersion(): Promise<string>;
  /** Asks the update server. Null when the installed version is the latest. */
  check(): Promise<FoundUpdate | null>;
  /** Starts the app again. */
  relaunch(): Promise<void>;
  /** Saves what is open, before the app restarts. */
  beforeRestart?: () => Promise<void>;
  /** Where the setting and the time of the last check are kept; localStorage in the apps. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => number;
}

export type Phase =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "installing"
  /** A check that someone started failed. */
  | "check-failed"
  /** The update couldn't be downloaded or installed. */
  | "install-failed";

export interface UpdatesState {
  /** The installed version, once known. */
  current: string | null;
  /** Check for updates automatically. */
  auto: boolean;
  phase: Phase;
  /** The version being downloaded, ready or installing. */
  update: { version: string; notes: string; date: string | null } | null;
  /** The share of the download done, from 0 to 1, or null when unknown. */
  progress: number | null;
  /** When the last check answered, in ms since the epoch. */
  checkedAt: number | null;
  /** Later was chosen: the card stays hidden until the app starts again. */
  dismissed: boolean;
}

export const AUTO_KEY = "scholarkit.updates.auto";
export const CHECKED_KEY = "scholarkit.updates.checked-at";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** The first check waits a little, so it doesn't compete with opening the app. */
export const START_DELAY_MS = 5_000;

function read(storage: UpdaterDeps["storage"], key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: UpdaterDeps["storage"], key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Private windows and full storage: the setting lasts until the app closes.
  }
}

export interface Updater {
  state(): UpdatesState;
  subscribe(listener: () => void): () => void;
  /**
   * Starts the schedule: a check soon after the start, and one a day after that while
   * the app is open. Returns a function that stops it.
   */
  start(): () => void;
  /** Checks now. `manual` is a check someone asked for: a failure shows. */
  check(options?: { manual?: boolean }): Promise<void>;
  /** Saves, installs the downloaded version and starts the app again. */
  restart(): Promise<void>;
  /** Hides the card until the app starts again. */
  later(): void;
  setAuto(auto: boolean): void;
}

export function createUpdater(deps: UpdaterDeps): Updater {
  const now = deps.now ?? Date.now;
  const storage =
    deps.storage === undefined
      ? typeof localStorage === "undefined"
        ? null
        : localStorage
      : deps.storage;

  const checked = Number(read(storage, CHECKED_KEY));
  let state: UpdatesState = {
    current: null,
    auto: read(storage, AUTO_KEY) !== "false",
    phase: "idle",
    update: null,
    progress: null,
    checkedAt: Number.isFinite(checked) && checked > 0 ? checked : null,
    dismissed: false,
  };
  let found: FoundUpdate | null = null;
  const listeners = new Set<() => void>();

  const set = (next: Partial<UpdatesState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  void deps.currentVersion().then(
    (current) => set({ current }),
    () => {},
  );

  const busy = () =>
    state.phase === "checking" ||
    state.phase === "downloading" ||
    state.phase === "ready" ||
    state.phase === "installing";

  async function check({ manual = false }: { manual?: boolean } = {}): Promise<void> {
    if (busy()) {
      // Asking again while a version is ready shows its card again.
      if (manual && state.dismissed) set({ dismissed: false });
      return;
    }
    set({ phase: "checking", dismissed: false });
    let update: FoundUpdate | null;
    try {
      update = await deps.check();
    } catch {
      set({ phase: manual ? "check-failed" : "idle" });
      return;
    }
    const at = now();
    write(storage, CHECKED_KEY, String(at));
    if (!update) {
      found = null;
      set({ phase: "idle", update: null, checkedAt: at });
      return;
    }
    found = update;
    set({
      phase: "downloading",
      checkedAt: at,
      progress: 0,
      update: { version: update.version, notes: update.notes, date: update.date },
    });
    try {
      await update.download((progress) => set({ progress }));
      set({ phase: "ready", progress: 1 });
    } catch {
      // A download in the background that fails tries again with the next check. One someone
      // asked for says so, with the way to download by hand.
      found = null;
      set(manual ? { phase: "install-failed" } : { phase: "idle", update: null });
    }
  }

  async function restart(): Promise<void> {
    if (state.phase !== "ready" || !found) return;
    set({ phase: "installing" });
    try {
      await deps.beforeRestart?.();
      await found.install();
      await deps.relaunch();
    } catch {
      set({ phase: "install-failed" });
    }
  }

  function start(): () => void {
    const due = () =>
      state.auto && (state.checkedAt === null || now() - state.checkedAt >= DAY_MS);
    // The app checks once soon after it starts, when the setting is on;
    // after that, each hour looks whether a day has passed since the last answer.
    const first = setTimeout(() => {
      if (state.auto) void check();
    }, START_DELAY_MS);
    const hourly = setInterval(() => {
      if (due()) void check();
    }, HOUR_MS);
    return () => {
      clearTimeout(first);
      clearInterval(hourly);
    };
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    check,
    restart,
    later() {
      set({ dismissed: true });
    },
    setAuto(auto) {
      write(storage, AUTO_KEY, String(auto));
      set({ auto });
    },
  };
}
