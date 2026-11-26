import { t } from "@scholarkit/i18n";
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import type { ContextChip as Chip } from "./conversation";
import { Icon } from "./icons";
import { ContextChip } from "./parts";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  working: boolean;
  placeholder: string;
  /** What goes with the question; the person can take each one off. */
  chips?: Chip[];
  onRemoveChip?: (id: string) => void;
  /** Adds a file, a source or a note to the question. */
  onAttach?: () => void;
  /** Opens the app's `@` menu to name a file or a source. */
  onMention?: () => void;
  /** Opens the app's actions. */
  onActions?: () => void;
  /** Which model answers, such as "Scholarkit AI" or a local model; opens the choice. */
  model?: ReactNode;
  onPickModel?: () => void;
  disabled?: boolean;
  /** For the app's shortcut (Cmd+J) to put the cursor in the composer. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

/** Where the person types, the same in every app. Enter sends, Shift+Enter starts a new line. */
export function Composer(props: ComposerProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const input = props.inputRef ?? own;
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [props.value, input]);
  const canSend = !props.disabled && props.value.trim() !== "";
  return (
    <div className="assistant-composer">
      {props.chips && props.chips.length > 0 && (
        <div className="assistant-chips">
          {props.chips.map((chip) => (
            <ContextChip
              key={chip.id}
              chip={chip}
              onRemove={
                props.onRemoveChip ? () => props.onRemoveChip?.(chip.id) : undefined
              }
            />
          ))}
        </div>
      )}
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
      <div className="assistant-composer-bar">
        {props.onAttach && (
          <button
            type="button"
            className="assistant-icon"
            onClick={props.onAttach}
            title={t("Add context")}
          >
            <Icon name="plus" />
          </button>
        )}
        {props.onMention && (
          <button
            type="button"
            className="assistant-icon"
            onClick={props.onMention}
            title={t("Mention")}
          >
            <Icon name="at-sign" />
          </button>
        )}
        {props.onActions && (
          <button
            type="button"
            className="assistant-icon"
            onClick={props.onActions}
            title={t("Actions")}
          >
            <Icon name="slash" />
          </button>
        )}
        <span className="assistant-grow" />
        {props.model &&
          (props.onPickModel ? (
            <button
              type="button"
              className="assistant-model"
              onClick={props.onPickModel}
            >
              {props.model}
              <Icon name="chevron-down" size={12} />
            </button>
          ) : (
            <span className="assistant-model">{props.model}</span>
          ))}
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
    </div>
  );
}
