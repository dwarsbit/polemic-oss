/**
 * The review cards: what a `propose` tool hands the person. Nothing changes
 * until they press the card's button, and the card then says what happened.
 */

import { formatNumber, t } from "@scholarkit/i18n";
import type { ReactNode } from "react";
import type { LineDiff } from "./diff";
import { Icon } from "./icons";

export type CardState = "open" | "applied" | "discarded";

export interface CardAction {
  label: string;
  icon?: string;
  primary?: boolean;
  onClick: () => void;
}

function Actions({ actions }: { actions: CardAction[] }) {
  return (
    <>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="assistant-button"
          data-variant={action.primary ? "primary" : "ghost"}
          onClick={action.onClick}
        >
          {action.icon && <Icon name={action.icon} size={14} />}
          {action.label}
        </button>
      ))}
    </>
  );
}

/** A change to a file or a note, as a diff, to apply or discard. */
export function DiffCard({
  file,
  diff,
  where,
  note,
  state,
  applyLabel,
  onApply,
  onDiscard,
  mono = true,
}: {
  file: string;
  diff: LineDiff;
  /** Where it goes, such as "Line 6". */
  where?: string;
  /** Next to the buttons, such as "You can undo this from snapshots." */
  note?: string;
  state: CardState;
  /** Such as "Apply and compile"; "Apply" when left out. */
  applyLabel?: string;
  onApply: () => void;
  onDiscard: () => void;
  /** Code in a monospace font; false for prose. */
  mono?: boolean;
}) {
  return (
    <div className="assistant-card assistant-diff" data-state={state}>
      <div className="assistant-card-head">
        <Icon name="file-text" size={14} />
        <span className="assistant-file">{file}</span>
        {diff.added > 0 && (
          <span className="assistant-pill" data-tone="add">
            +{formatNumber(diff.added)}
          </span>
        )}
        {diff.removed > 0 && (
          <span className="assistant-pill" data-tone="del">
            −{formatNumber(diff.removed)}
          </span>
        )}
        <span className="assistant-grow" />
        {where && <span className="assistant-muted">{where}</span>}
      </div>
      <div className="assistant-lines" data-mono={mono || undefined}>
        {diff.hunks.map((hunk, h) => (
          <div key={h} className="assistant-hunk">
            {hunk.lines.map((line, i) => (
              <div key={i} className="assistant-line" data-kind={line.kind}>
                <span className="assistant-line-n">{line.number}</span>
                <span className="assistant-line-sign">
                  {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                </span>
                <span className="assistant-line-text">{line.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="assistant-card-foot">
        {state === "open" ? (
          <>
            <span className="assistant-muted assistant-grow">{note}</span>
            <Actions
              actions={[
                { label: t("Discard"), onClick: onDiscard },
                {
                  label: applyLabel ?? t("Apply"),
                  icon: "check",
                  primary: true,
                  onClick: onApply,
                },
              ]}
            />
          </>
        ) : (
          <span className="assistant-muted assistant-grow">
            {state === "applied" ? t("Applied.") : t("Discarded.")}
          </span>
        )}
      </div>
    </div>
  );
}

/** A paper the assistant found, with the passage that backs the claim. */
export function PaperCard({
  title,
  meta,
  freePdf,
  quote,
  actions,
  best,
}: {
  title: string;
  /** Authors, journal and year, as the app writes them. */
  meta: string;
  freePdf?: boolean;
  quote?: string;
  actions: CardAction[];
  /** The first pick: drawn in the tint. */
  best?: boolean;
}) {
  return (
    <div className="assistant-card assistant-paper" data-best={best || undefined}>
      <div className="assistant-paper-title">{title}</div>
      <div className="assistant-muted">
        {meta}
        {freePdf && (
          <>
            {" · "}
            <span className="assistant-ok">{t("Free PDF")}</span>
          </>
        )}
      </div>
      {quote && <blockquote className="assistant-quote">{quote}</blockquote>}
      <div className="assistant-card-actions">
        <Actions actions={actions} />
      </div>
    </div>
  );
}

/** A numbered passage from the person's sources, and whether it was found word for word. */
export function SourceQuote({
  n,
  source,
  found,
  quote,
  onOpen,
}: {
  n: number;
  /** Such as "Santamouris · 2014 · p. 12". */
  source: string;
  found: boolean;
  quote: string;
  onOpen?: () => void;
}) {
  const body: ReactNode = (
    <>
      <span className="assistant-cite">{n}</span>
      <span className="assistant-source-body">
        <span className="assistant-source-meta">
          {source}
          {found ? (
            <span className="assistant-ok">
              <Icon name="circle-check" size={12} />
              {t("Quote found")}
            </span>
          ) : (
            <span className="assistant-warn">
              <Icon name="triangle-alert" size={12} />
              {t("Not found word for word")}
            </span>
          )}
        </span>
        <span className="assistant-source-quote">“{quote}”</span>
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className="assistant-source" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="assistant-source">{body}</div>
  );
}

/** Buttons under an answer, such as Save as note and Copy. */
export function AnswerActions({ actions }: { actions: CardAction[] }) {
  return (
    <div className="assistant-card-actions">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="assistant-button"
          data-variant={action.primary ? "primary" : "outline"}
          onClick={action.onClick}
        >
          {action.icon && <Icon name={action.icon} size={14} />}
          {action.label}
        </button>
      ))}
    </div>
  );
}
