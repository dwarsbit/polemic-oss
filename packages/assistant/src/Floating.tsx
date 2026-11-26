/**
 * The floating layout, the default in every app: a bar at the bottom of the
 * work area to ask from, and above it a sheet with the latest answer, its
 * steps and its cards. The whole conversation opens in the docked panel,
 * the other layout, one click away.
 */

import { t } from "@scholarkit/i18n";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import type { AssistantEntry, ContextChip as Chip, Entry } from "./conversation";
import { AssistantMark, Icon } from "./icons";
import { AssistantTurn, ContextChip } from "./parts";

/** Where the assistant sits: floating over the work (the default), or docked on the right. */
export type AssistantLayout = "floating" | "docked";

export const DEFAULT_LAYOUT: AssistantLayout = "floating";

export interface AskBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  working: boolean;
  placeholder: string;
  chips?: Chip[];
  onRemoveChip?: (id: string) => void;
  model?: ReactNode;
  onPickModel?: () => void;
  /** The app's own control before Send, such as Polemic's mode menu. */
  extra?: ReactNode;
  disabled?: boolean;
  /** For the app's shortcut (Cmd+J) to put the cursor in the bar. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

/** The bar to ask from: one line that grows, the mark, what goes with the question, Send. */
export function AskBar(props: AskBarProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const input = props.inputRef ?? own;
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [props.value, input]);
  const canSend = !props.disabled && props.value.trim() !== "";
  return (
    <div className="assistant-bar" data-working={props.working || undefined}>
      <AssistantMark />
      {props.chips?.map((chip) => (
        <ContextChip
          key={chip.id}
          chip={chip}
          onRemove={
            props.onRemoveChip ? () => props.onRemoveChip?.(chip.id) : undefined
          }
        />
      ))}
      <textarea
        ref={input}
        rows={1}
        value={props.value}
        placeholder={props.placeholder}
        aria-label={t("Ask the assistant")}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend && !props.working) props.onSend();
          }
        }}
      />
      {props.model &&
        (props.onPickModel ? (
          <button type="button" className="assistant-model" onClick={props.onPickModel}>
            {props.model}
            <Icon name="chevron-down" size={12} />
          </button>
        ) : (
          <span className="assistant-model">{props.model}</span>
        ))}
      {props.extra}
      {props.working ? (
        <button
          type="button"
          className="assistant-send"
          data-stop=""
          onClick={props.onStop}
          title={t("Stop")}
        >
          <i />
        </button>
      ) : (
        <button
          type="button"
          className="assistant-send"
          disabled={!canSend}
          onClick={props.onSend}
          title={t("Send")}
        >
          <Icon name="arrow-up" size={14} />
        </button>
      )}
    </div>
  );
}

export interface AssistantFloatingProps<A> {
  entries: Entry<A>[];
  /** The bar; usually `AskBar`. */
  bar: ReactNode;
  /** Whether the sheet with the latest answer shows. The app opens it on each question. */
  open: boolean;
  /** Hides the sheet; the conversation stays. */
  onClose: () => void;
  /** Opens the whole conversation in the docked panel. */
  onDock: () => void;
  renderAttachment?: (attachment: A, entry: AssistantEntry<A>) => ReactNode;
  onCite?: (n: number) => void;
}

/**
 * The bar with the latest answer above it. Put it in a positioned box over
 * the work area: it sits at the bottom, centered, and lets clicks through
 * around it.
 */
export function AssistantFloating<A>(props: AssistantFloatingProps<A>) {
  const last = [...props.entries].reverse();
  const turn = last.find((e): e is AssistantEntry<A> => e.kind === "assistant");
  const question = turn ? props.entries.find((e) => e.id === turn.id - 1) : undefined;
  const earlier = props.entries.filter((e) => e.kind === "user").length - 1;
  return (
    <div
      className="assistant-floating"
      onKeyDown={(e) => {
        if (e.key === "Escape" && props.open) {
          e.preventDefault();
          props.onClose();
        }
      }}
    >
      {props.open && turn && (
        <section
          className="assistant-sheet"
          aria-label={t("Assistant")}
          aria-live="polite"
        >
          <header className="assistant-sheet-head">
            {question?.kind === "user" && (
              <span className="assistant-sheet-question">{question.text}</span>
            )}
            <span className="assistant-grow" />
            {earlier > 0 && (
              <button
                type="button"
                className="assistant-sheet-earlier"
                onClick={props.onDock}
              >
                {t("Earlier questions")}
              </button>
            )}
            <button
              type="button"
              className="assistant-icon"
              onClick={props.onDock}
              title={t("Open in the side panel")}
            >
              <Icon name="panel-right" size={15} />
            </button>
            <button
              type="button"
              className="assistant-icon"
              onClick={props.onClose}
              title={t("Close")}
            >
              <Icon name="x" size={15} />
            </button>
          </header>
          <div className="assistant-sheet-body">
            <AssistantTurn
              entry={turn}
              renderAttachment={props.renderAttachment}
              onCite={props.onCite}
              openSteps
            />
          </div>
        </section>
      )}
      {props.bar}
    </div>
  );
}
