import { errorText } from "@/lib/error-text";
import { create } from "zustand";
import { openLive, type DesktopLive } from "@/lib/desktop-live";
import { attachPresence } from "@/lib/live-presence";
import { LinkSync, type FolderChange, type LinkApi } from "@/lib/link-sync";
import { publishApi, pullReviewComments } from "@/lib/share";
import { syncedDriveOf } from "@/lib/synced-drive";
import { features } from "@/lib/target";
import {
  accountStatus,
  isShareError,
  linkEnable,
  linkLoad,
  linkMove,
  linkRemove,
  linkSave,
  linkWriteAsset,
  linkWriteText,
  onProjectFilesChanged,
  readProjectFile,
  gitStatus,
  shareFolder,
  shareInfo,
  shareMembers,
  sharePush,
  shareStatus,
  shareSync,
  shareSyncTicket,
  shareUploadAssets,
  type ShareError,
} from "@/lib/tauri";

/**
 * Where the open project's sync stands, for the status bar and the
 * Share dialog. Only linked projects in the desktop app have one; in
 * the browser the project is the server's.
 */
export type LinkStatus =
  | { kind: "syncing" }
  | { kind: "synced"; at: number }
  /** Changes stay on this computer until the server is back. */
  | { kind: "offline"; message: string }
  /** The owner's storage is full: changes stay here, the server's still arrive. */
  | { kind: "full"; message: string }
  | { kind: "signedOut" }
  | { kind: "failed"; message: string };

interface LinkState {
  /** The folder of the project that syncs; null when the open project doesn't. */
  dir: string | null;
  status: LinkStatus | null;
  /**
   * The project is shared with others and open live, as in the
   * browser: their edits arrive as they type, yours save as you type.
   */
  live: boolean;
  /** Told once per project: it now syncs both ways (shared before
   *  that), or it sits in a synced drive's folder. */
  notice: LinkNotice | null;
  /** Starts syncing the project in `dir` when it is linked. */
  start: (dir: string) => Promise<void>;
  stop: () => void;
  /** Syncs now: after a save, on focus, from the Share dialog. */
  syncNow: () => Promise<void>;
  /** Opens the live connection once the project is shared with others, as after the Share dialog. */
  goLive: () => Promise<void>;
  dismissNotice: () => void;
}

export interface LinkNotice {
  /** Shared before two-way sync, and syncing both ways from now on. */
  upgraded: boolean;
  /** The sync service whose folder holds the project, e.g. iCloud Drive. */
  drive: string | null;
  /** The folder has a Git remote, and other people work on the project. */
  git: boolean;
}

const DRIVE_WARNED = "polemic.linkDriveWarned";
const GIT_WARNED = "polemic.linkGitWarned";

function warnedFor(key: string): string[] | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return null;
  }
}

/** True the first time for `dir`, then false: the warning shows once. */
function warnOnce(key: string, dir: string): boolean {
  try {
    const warned = warnedFor(key) ?? [];
    if (warned.includes(dir)) return false;
    localStorage.setItem(key, JSON.stringify([...warned, dir]));
  } catch {
    // No storage: warn every time rather than never.
  }
  return true;
}

/**
 * Whether to warn about a Git remote: the folder has one and other
 * people work on the project, so a merge's conflict markers would reach
 * them too. Asked once per folder; any failure means no warning.
 */
async function gitShared(dir: string, role: string | null): Promise<boolean> {
  if (warnedFor(GIT_WARNED)?.includes(dir)) return false;
  try {
    if (!(await gitStatus(dir)).remote) return false;
    if (role === "owner") return (await shareMembers(dir)).members.length > 0;
    return role !== null;
  } catch {
    return false;
  }
}

/** How often the server is asked for changes, with the window in front and behind. */
const POLL_FOCUSED_MS = 3_000;
const POLL_BACKGROUND_MS = 30_000;
/** While live, the connection tells of changes: polling is only the fallback. */
const POLL_LIVE_MS = 30_000;
/** The longest wait between tries while the server can't be reached. */
const MAX_BACKOFF_MS = 60_000;
/** How often going live is tried again, on focus or when others' changes arrive. */
const LIVE_RETRY_MS = 30_000;

/** The LinkApi of the project in `dir`, through the Rust side. */
export function linkApi(dir: string): LinkApi {
  return {
    load: () => linkLoad(dir),
    save: (state, pending) => linkSave(dir, state, pending),
    folder: () => shareFolder(dir),
    sync: (stateVector) => shareSync(dir, stateVector),
    push: (update) => sharePush(dir, update),
    uploadAssets: (hashes) => shareUploadAssets(dir, hashes),
    readText: (path) => readProjectFile(dir, path).catch(() => null),
    writeText: (path, text, expected) => linkWriteText(dir, path, text, expected),
    writeAsset: (path, hash) => linkWriteAsset(dir, path, hash),
    move: (from, to) => linkMove(dir, from, to),
    remove: (path) => linkRemove(dir, path),
  };
}

function statusFor(error: unknown): LinkStatus {
  if (!isShareError(error)) {
    return {
      kind: "failed",
      message: errorText(error),
    };
  }
  const e: ShareError = error;
  switch (e.kind) {
    case "signedOut":
      return { kind: "signedOut" };
    case "unavailable":
      return { kind: "offline", message: e.message };
    case "tooLarge":
      return { kind: "full", message: e.message };
    default:
      return { kind: "failed", message: e.message };
  }
}

/** Hands what a sync wrote to the project store, which owns the open files. */
let onFolderChanges: (dir: string, changes: FolderChange[]) => void = () => {};

export function setFolderChangeHandler(handler: typeof onFolderChanges) {
  onFolderChanges = handler;
}

let sync: LinkSync | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let unlisten: (() => void) | null = null;
let live: DesktopLive | null = null;
let stopPresence: (() => void) | null = null;
let goingLive = false;
let liveTried = 0;

const focused = () => typeof document === "undefined" || document.hasFocus();

export const useLinkStore = create<LinkState>((set, get) => {
  function schedule() {
    if (timer) clearTimeout(timer);
    const wait =
      failures > 0
        ? Math.min(MAX_BACKOFF_MS, POLL_FOCUSED_MS * 2 ** failures)
        : live
          ? POLL_LIVE_MS
          : focused()
            ? POLL_FOCUSED_MS
            : POLL_BACKGROUND_MS;
    timer = setTimeout(() => void run(), wait);
  }

  async function run(
    how: (s: LinkSync) => ReturnType<LinkSync["run"]> = (s) => s.run(),
  ) {
    const current = sync;
    const dir = get().dir;
    if (!current || !dir) return;
    if (get().status?.kind !== "synced") set({ status: { kind: "syncing" } });
    try {
      const result = await how(current);
      if (sync !== current) return;
      failures = 0;
      set({ status: { kind: "synced", at: Date.now() } });
      if (result.changed.length > 0) {
        onFolderChanges(dir, result.changed);
        // Someone else is at work in the project: it may be shared by now.
        void goLiveSoon();
      }
    } catch (e) {
      if (sync !== current) return;
      const status = statusFor(e);
      set({ status });
      // Signed out, or the server copy was deleted (the link is forgotten): stop.
      if (status.kind === "signedOut" || (isShareError(e) && e.kind === "notFound")) {
        get().stop();
        set({ status });
        return;
      }
      failures++;
    }
    if (sync === current) schedule();
  }

  function closeLive() {
    stopPresence?.();
    stopPresence = null;
    live?.close();
    live = null;
    if (get().live) set({ live: false });
  }

  /** Goes live unless it was tried in the last LIVE_RETRY_MS. */
  function goLiveSoon() {
    if (live || Date.now() - liveTried < LIVE_RETRY_MS) return Promise.resolve();
    return get().goLive();
  }

  return {
    dir: null,
    status: null,
    live: false,
    notice: null,

    start: async (dir) => {
      get().stop();
      if (!features.localFiles) return;
      const share = await Promise.resolve()
        .then(() => shareStatus(dir))
        .catch(() => null);
      if (!share?.signedIn || !share.link) return;
      set({ dir, status: { kind: "syncing" } });
      let upgraded = false;
      try {
        if (!share.link.twoWay) {
          // Shared before two-way sync: reviewers' comments come in
          // first, as a publish did, then the folder and the server
          // copy sync from here on.
          await pullReviewComments(publishApi(dir));
          await linkEnable(dir);
          upgraded = true;
        }
      } catch (e) {
        if (get().dir === dir) set({ status: statusFor(e) });
        return;
      }
      if (get().dir !== dir) return;
      // The role decides whether this folder's changes go up; offline,
      // they are kept and go up once the server says they may.
      const info = await Promise.resolve()
        .then(() => shareInfo(dir))
        .catch(() => null);
      if (get().dir !== dir) return;
      const drive = syncedDriveOf(dir);
      const git =
        (await gitShared(dir, info?.role ?? null)) && warnOnce(GIT_WARNED, dir);
      if (get().dir !== dir) return;
      const driveNow = drive && warnOnce(DRIVE_WARNED, dir) ? drive : null;
      if (upgraded || git || driveNow) {
        set({ notice: { upgraded, drive: driveNow, git } });
      }
      sync = new LinkSync(linkApi(dir), { writable: info?.writable ?? true });
      failures = 0;
      unlisten = onProjectFilesChanged((changed, change) => {
        if (changed !== get().dir || !sync) return;
        void run((s) => s.local(change));
      });
      await run();
      await get().goLive();
    },

    goLive: async () => {
      const current = sync;
      const dir = get().dir;
      if (!current || !dir || live || goingLive) return;
      goingLive = true;
      liveTried = Date.now();
      try {
        const share = await shareStatus(dir);
        const ticket = await shareSyncTicket(dir);
        if (!ticket.shared || !share.link || sync !== current) return;
        // A change arrives on the connection: fetch it now, unless the copy has it (your own).
        let pending: ReturnType<typeof setTimeout> | null = null;
        const opened = await openLive({
          server: share.server,
          projectId: share.link.projectId,
          ticket: ticket.ticket,
          nextTicket: async () => (await shareSyncTicket(dir)).ticket,
          onChange: () => {
            if (pending || sync !== current || !live || current.covers(live.doc))
              return;
            pending = setTimeout(() => {
              pending = null;
              if (sync === current) void run();
            }, 0);
          },
          onLost: () => {
            if (live === opened) closeLive();
          },
        });
        if (sync !== current) {
          opened.close();
          return;
        }
        live = opened;
        stopPresence = attachPresence(opened, async () =>
          accountStatus()
            .then((account) => account.user?.id ?? null)
            .catch(() => null),
        );
        set({ live: true });
        // What came in while connecting, and the slower polling from now on.
        void run();
      } catch {
        // Not shared with anyone, an older server, or offline: tried again later.
      } finally {
        goingLive = false;
      }
    },

    stop: () => {
      closeLive();
      if (timer) clearTimeout(timer);
      timer = null;
      unlisten?.();
      unlisten = null;
      sync = null;
      failures = 0;
      set({ dir: null, status: null });
    },

    syncNow: async () => {
      if (!sync) return;
      failures = 0;
      void goLiveSoon();
      await run((s) => s.local({ kind: "scan" }));
    },

    dismissNotice: () => set({ notice: null }),
  };
});
