/**
 * Saving as you type: a background save of each short burst of edits,
 * so the compile and everyone else see them right away. The browser
 * build always saves this way; the desktop app does in a project
 * that is live (shared with others, src/store/link.ts). One save at a
 * time; edits made while one runs go in the next, and typing without
 * a pause still saves every MAX_WAIT_MS.
 */

import { useEditorStore } from "@/store/editor";
import { useProjectStore } from "@/store/project";

/** Typing without a pause still saves this often. */
const MAX_WAIT_MS = 600;
/** A save that didn't go through (the file changed on disk meanwhile) is tried again this often. */
const RETRY_MS = 1_000;
const MAX_RETRIES = 5;

const dirty = () =>
  useEditorStore.getState().content !== useProjectStore.getState().lastSavedContent;

export interface SaveAsYouType {
  /** A save is waiting or running. */
  pending(): boolean;
  stop(): void;
}

/** Saves `delayMs` after each burst of edits, while `enabled()`. */
export function saveAsYouType(enabled: () => boolean, delayMs: number): SaveAsYouType {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> | null = null;
  let again = false;
  let retries = 0;
  // When the first edit not saved yet was made.
  let since: number | null = null;

  const arm = (wait: number) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void save(), wait);
  };

  const saveOnce = async () => {
    const store = useProjectStore.getState();
    if (!enabled() || !store.project || store.project.readOnly) return;
    try {
      await store.flushBuffers();
      await store.saveActiveFile({ background: true });
    } catch {
      // Tried again below, and after the next edit.
    }
  };

  const save = async () => {
    timer = null;
    since = null;
    if (saving) {
      again = true;
      return;
    }
    saving = (async () => {
      do {
        again = false;
        await saveOnce();
      } while (again);
    })();
    await saving;
    saving = null;
    // Not saved, as when a change from the others was being written into the file: once more.
    if (enabled() && dirty() && timer === null && retries < MAX_RETRIES) {
      retries++;
      arm(RETRY_MS);
    }
  };

  const stopEditor = useEditorStore.subscribe((state, previous) => {
    // A loaded file (docVersion moved) is not an edit.
    // Nor is someone else's edit coming in (the content is what was saved).
    if (
      state.content === previous.content ||
      state.docVersion !== previous.docVersion ||
      state.content === useProjectStore.getState().lastSavedContent ||
      !enabled()
    )
      return;
    retries = 0;
    since ??= Date.now();
    arm(Math.min(delayMs, Math.max(0, since + MAX_WAIT_MS - Date.now())));
  });

  return {
    pending: () => timer !== null || saving !== null,
    stop: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      stopEditor();
    },
  };
}
