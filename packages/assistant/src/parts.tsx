/**
 * The assistant's parts that look the same in every app: the Ask button,
 * the context chips, the step list, the turns of a conversation and the
 * usage line. Each app puts them in its own place and passes its tools'
 * cards through `renderAttachment`.
 */

import { formatNumber, t, tn } from "@scholarkit/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Step } from "./agent";
import type { AssistantEntry, ContextChip as Chip, Entry } from "./conversation";
import { Icon, Spark } from "./icons";
import { shortcutLabel } from "./react";
import { AssistantText } from "./text";
import { errorMessage } from "./transport";

/** Opens the assistant; sits next to the avatar in every app's header. */
export function AskButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="assistant-ask"
      data-on={on || undefined}
      aria-pressed={on}
      onClick={onClick}
      title={t("Ask the assistant ({shortcut})", { shortcut: shortcutLabel() })}
    >
      <Spark />
      {t("Ask")}
    </button>
  );
}

/** What the question is about: the open file, a selection, an error. */
export function ContextChip({ chip, onRemove }: { chip: Chip; onRemove?: () => void }) {
  return (
    <span className="assistant-chip" data-tone={chip.tone}>
      {chip.icon && <Icon name={chip.icon} size={13} />}
      <span className="assistant-chip-label">{chip.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("Remove {name}", { name: chip.label })}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

/** What the assistant did, folded into one line once it is done. */
export function StepList({
  steps,
  current,
  working,
  startOpen = false,
}: {
  steps: Step[];
  current: string | null;
  working: boolean;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  if (steps.length === 0 && !working) return null;
  const failed = steps.some((s) => !s.ok);
  if (working)
    return (
      <div className="assistant-steps" data-open="">
        {steps.map((step, i) => (
          <StepRow key={i} step={step} />
        ))}
        <div className="assistant-step">
          <Icon name="loader-circle" size={13} className="assistant-spin" />
          <span className="assistant-shimmer">{current ?? t("Thinking…")}</span>
        </div>
      </div>
    );
  return (
    <div className="assistant-steps" data-open={open ? "" : undefined}>
      <button
        type="button"
        className="assistant-steps-summary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={failed ? "circle-alert" : "circle-check"} size={14} />
        <span>{tn(steps.length, "{count} step", "{count} steps")}</span>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={12} />
      </button>
      {open && steps.map((step, i) => <StepRow key={i} step={step} />)}
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <div className="assistant-step" data-failed={step.ok ? undefined : ""}>
      <Icon name={step.ok ? "circle-check" : "circle-x"} size={13} />
      <span>{step.label}</span>
    </div>
  );
}

/** One answer: its steps, its text, its cards and how it ended. */
export function AssistantTurn<A>({
  entry,
  renderAttachment,
  onCite,
  openSteps = false,
}: {
  entry: AssistantEntry<A>;
  renderAttachment?: (attachment: A, entry: AssistantEntry<A>) => ReactNode;
  onCite?: (n: number) => void;
  /** Shows the steps as a list from the start, as the floating sheet does. */
  openSteps?: boolean;
}) {
  const working = entry.status === "working" || entry.status === "waiting";
  return (
    <div className="assistant-turn">
      <StepList
        steps={entry.steps}
        current={entry.current}
        working={working}
        startOpen={openSteps}
      />
      {entry.text && <AssistantText text={entry.text} onCite={onCite} />}
      {entry.attachments.map((a, i) => (
        <div key={i} className="assistant-attachment">
          {renderAttachment?.(a, entry)}
        </div>
      ))}
      {entry.status === "stopped" && <p className="assistant-note">{t("Stopped.")}</p>}
      {entry.status === "limit" && (
        <p className="assistant-note">
          {t("The assistant took many steps and paused. Ask it to go on.")}
        </p>
      )}
      {entry.status === "failed" && (
        <p className="assistant-note" data-tone="error" role="alert">
          <Icon name="circle-alert" size={14} />
          {errorMessage(entry.error)}
        </p>
      )}
    </div>
  );
}

/** The conversation, newest at the bottom, following the answer as it streams. */
export function ConversationView<A>({
  entries,
  renderAttachment,
  onCite,
  empty,
}: {
  entries: Entry<A>[];
  renderAttachment?: (attachment: A, entry: AssistantEntry<A>) => ReactNode;
  onCite?: (n: number) => void;
  /** Shown before the first question: what the assistant can do here. */
  empty?: ReactNode;
}) {
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    if (following.current) end.current?.scrollIntoView?.({ block: "end" });
  }, [entries]);
  return (
    <div
      ref={box}
      className="assistant-conversation"
      role="log"
      aria-live="polite"
      onScroll={() => {
        const el = box.current;
        if (el)
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {entries.length === 0 && empty}
      {entries.map((entry) =>
        entry.kind === "user" ? (
          <div key={entry.id} className="assistant-question">
            {entry.chips.length > 0 && (
              <div className="assistant-chips">
                {entry.chips.map((chip) => (
                  <ContextChip key={chip.id} chip={chip} />
                ))}
              </div>
            )}
            <div className="assistant-user">{entry.text}</div>
          </div>
        ) : (
          <AssistantTurn
            key={entry.id}
            entry={entry}
            renderAttachment={renderAttachment}
            onCite={onCite}
          />
        ),
      )}
      <div ref={end} />
    </div>
  );
}

/** Ready-made questions under an answer or in an empty panel. */
export function Suggestions({
  items,
}: {
  items: Array<{ label: string; icon?: string; onPick: () => void }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="assistant-suggestions">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="assistant-chip"
          onClick={item.onPick}
        >
          {item.icon && <Icon name={item.icon} size={13} />}
          <span className="assistant-chip-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Where the answers come from, and on our model how much of the month is used. */
export type UsageSource =
  | { kind: "ours"; plan: "plus" | "pro"; usedPercent: number }
  | { kind: "own-key"; provider: string }
  | { kind: "local"; model: string };

export function UsageLine({ source }: { source: UsageSource }) {
  const percent =
    source.kind === "ours"
      ? Math.min(100, Math.max(0, Math.round(source.usedPercent)))
      : 0;
  return (
    <div className="assistant-usage">
      {source.kind === "ours" ? (
        <>
          <span>{source.plan === "pro" ? "Pro" : "Plus"}</span>
          <span className="assistant-meter" data-full={percent >= 100 || undefined}>
            <i style={{ width: `${percent}%` }} />
          </span>
          <span>
            {t("{percent}% used this month", { percent: formatNumber(percent) })}
          </span>
        </>
      ) : source.kind === "own-key" ? (
        <span className="assistant-usage-key">
          <Icon name="key-round" size={12} />
          {t("Your {provider} key", { provider: source.provider })}
        </span>
      ) : (
        <span>{t("{model} on this computer", { model: source.model })}</span>
      )}
      <span className="assistant-grow" />
      <span className="assistant-usage-privacy">
        <Icon name="shield-check" size={12} />
        {source.kind === "local"
          ? t("Stays on this computer")
          : t("Not used for training")}
      </span>
    </div>
  );
}
