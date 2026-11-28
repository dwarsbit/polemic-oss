import { useEffect, useRef, useState } from "react";
import { formatDate, t } from "@scholarkit/i18n";
import { parseNotes, type Span } from "../notes";
import { UpdateIcon } from "./UpdateIcon";
import { useUpdates } from "../use-updates";
import type { Updater } from "../updates";

export const BUTTON =
  "h-7 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
export const PRIMARY_BUTTON =
  "h-7 rounded-md border border-primary-edge bg-primary-fill px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-fill/85 disabled:opacity-50";
export const QUIET_BUTTON =
  "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

export interface UpdateCardProps {
  updater: Updater;
  /** The app's name: Polemic, Cursive or Binder. */
  app: string;
  /** The app's download page, for an update that couldn't be installed. */
  downloadUrl: string;
  /** Opens a web address in the browser. */
  openUrl: (url: string) => void;
}

/**
 * "Update ready" at the bottom left of the window, once a new version is downloaded. It also
 * says when installing it failed, with the way to download it by hand.
 */
export function UpdateCard({ updater, app, downloadUrl, openUrl }: UpdateCardProps) {
  const state = useUpdates(updater);
  const [notes, setNotes] = useState(false);
  const version = state.update?.version ?? "";

  const shown =
    !state.dismissed &&
    (state.phase === "ready" ||
      state.phase === "installing" ||
      state.phase === "install-failed");
  if (!shown) return null;

  const failed = state.phase === "install-failed";
  const installing = state.phase === "installing";

  return (
    <>
      <section
        className="update-card p-3"
        role="status"
        aria-labelledby="update-card-title"
      >
        <h2 id="update-card-title" className="update-title">
          <UpdateIcon />
          {failed ? t("Update not installed") : t("Update ready")}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {failed
            ? t(
                "{app} {version} couldn’t be installed. Download it from scholarkit.app and install it over this version.",
                { app, version },
              )
            : installing
              ? t("Installing {app} {version}. {app} starts again in a moment.", {
                  app,
                  version,
                })
              : t(
                  "{app} {version} is downloaded. Restart {app} to install it. Your work is saved first.",
                  { app, version },
                )}
        </p>
        <div className="mt-2.5 flex items-center gap-1.5">
          {failed ? (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => {
                openUrl(downloadUrl);
                updater.later();
              }}
            >
              {t("Download")}
            </button>
          ) : (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={installing}
              onClick={() => void updater.restart()}
            >
              {installing ? t("Restarting…") : t("Restart now")}
            </button>
          )}
          <button
            type="button"
            className={QUIET_BUTTON}
            disabled={installing}
            onClick={() => updater.later()}
          >
            {t("Later")}
          </button>
          {state.update?.notes && (
            <button
              type="button"
              className="ml-auto text-xs font-medium text-primary hover:underline"
              onClick={() => setNotes(true)}
            >
              {t("What’s new")}
            </button>
          )}
        </div>
      </section>
      {notes && state.update && (
        <WhatsNew
          app={app}
          version={state.update.version}
          current={state.current}
          date={state.update.date}
          notes={state.update.notes}
          canRestart={state.phase === "ready"}
          onRestart={() => {
            setNotes(false);
            void updater.restart();
          }}
          onClose={() => setNotes(false)}
        />
      )}
    </>
  );
}

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, i) =>
    span.code ? (
      <code key={i}>{span.text}</code>
    ) : span.bold ? (
      <strong key={i} className="font-semibold">
        {span.text}
      </strong>
    ) : (
      <span key={i}>{span.text}</span>
    ),
  );
}

/** The version's changelog section. */
export function WhatsNew({
  app,
  version,
  current,
  date,
  notes,
  canRestart,
  onRestart,
  onClose,
}: {
  app: string;
  version: string;
  current: string | null;
  date: string | null;
  notes: string;
  canRestart: boolean;
  onRestart: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const released = date
    ? formatDate(new Date(date), { month: "long", day: "numeric", year: "numeric" })
    : null;
  const meta = [
    current && t("You have {version}.", { version: current }),
    released && t("Released {date}.", { date: released }),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={ref}
      className="update-dialog"
      aria-labelledby="whats-new-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex-none px-4 pt-4">
        <h2 id="whats-new-title" className="text-sm font-semibold">
          {t("What’s new in {app} {version}", { app, version })}
        </h2>
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      </div>
      <div className="update-notes min-h-0 flex-auto overflow-y-auto px-4 py-3 text-[13px] leading-relaxed">
        {parseNotes(notes).map((block, i) =>
          block.kind === "heading" ? (
            <h3 key={i} className="mt-3 mb-1 text-xs font-semibold first:mt-0">
              <Spans spans={block.spans} />
            </h3>
          ) : block.kind === "list" ? (
            <ul key={i} className="mb-2 list-disc space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Spans spans={item} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className="mb-2">
              <Spans spans={block.spans} />
            </p>
          ),
        )}
      </div>
      <div className="flex flex-none justify-end gap-1.5 border-t px-4 py-3">
        <button type="button" className={BUTTON} onClick={onClose}>
          {t("Close")}
        </button>
        {canRestart && (
          <button type="button" className={PRIMARY_BUTTON} onClick={onRestart}>
            {t("Restart now")}
          </button>
        )}
      </div>
    </dialog>
  );
}
