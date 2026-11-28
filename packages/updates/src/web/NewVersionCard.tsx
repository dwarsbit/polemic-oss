import { useState, useSyncExternalStore } from "react";
import { t as activeT, type Translator } from "@scholarkit/i18n";
import { UpdateIcon } from "../components/UpdateIcon";
import type { NewVersion } from "./new-version";

/** How long Load new version waits for the work to be saved before it gives up. */
export const SAVE_WAIT_MS = 10_000;

export interface NewVersionCardProps {
  watcher: NewVersion;
  /**
   * Writes what is still on its way: open files, edits not yet sent. Resolves once all of it is
   * saved; rejects, or takes longer than 10 seconds, when it can't be.
   */
  save?: () => Promise<unknown>;
  /** Loads the new version. The page's own reload unless a test gives another. */
  reload?: () => void;
  /** The translator, for a page rendered on the server (the web home); else the app's language. */
  t?: Translator["t"];
}

/**
 * "A new version is available" at the bottom left of the page, as the desktop apps' "Update
 * ready". Load new version saves first and reloads only once everything is saved; Later hides
 * the card until yet another version comes.
 */
export function NewVersionCard({
  watcher,
  save,
  reload = () => window.location.reload(),
  t = activeT,
}: NewVersionCardProps) {
  const available = useSyncExternalStore(
    watcher.subscribe,
    watcher.available,
    () => false,
  );
  const [phase, setPhase] = useState<"idle" | "saving" | "not-saved">("idle");
  if (!available) return null;

  const load = async () => {
    setPhase("saving");
    if (await savedWithin(save, SAVE_WAIT_MS)) reload();
    else setPhase("not-saved");
  };

  return (
    <section
      className="update-card new-version-card"
      role="status"
      aria-labelledby="new-version-title"
    >
      <h2 id="new-version-title" className="update-title">
        <UpdateIcon />
        {t("A new version is available")}
      </h2>
      <p className="update-text">
        {phase === "not-saved"
          ? t("Your latest changes aren’t saved yet. Try again in a moment.")
          : t("Load it to get the latest changes and fixes. Your work is saved first.")}
      </p>
      <div className="update-actions">
        <button
          type="button"
          className="update-button update-button-primary"
          disabled={phase === "saving"}
          onClick={() => void load()}
        >
          {phase === "saving" ? t("Saving…") : t("Load new version")}
        </button>
        <button
          type="button"
          className="update-button update-button-quiet"
          disabled={phase === "saving"}
          onClick={() => {
            setPhase("idle");
            watcher.later();
          }}
        >
          {t("Later")}
        </button>
      </div>
    </section>
  );
}

/** True when `save` finishes within `ms`; nothing to save counts as saved. */
async function savedWithin(save: (() => Promise<unknown>) | undefined, ms: number) {
  if (!save) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([save().then(() => true as const), late]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
