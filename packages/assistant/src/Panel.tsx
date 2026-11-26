import { t } from "@scholarkit/i18n";
import type { ReactNode } from "react";
import { AssistantMark, Icon } from "./icons";

export interface PanelMode {
  id: string;
  label: string;
}

export interface AssistantPanelProps {
  /** The conversation, usually `ConversationView`. */
  children: ReactNode;
  /** Where the person types, usually `Composer`. */
  composer: ReactNode;
  /** Under the composer, usually `UsageLine`. */
  footer?: ReactNode;
  onClose: () => void;
  onNew: () => void;
  onHistory?: () => void;
  /** Goes back to the floating layout; without it there is no such button. */
  onFloat?: () => void;
  /** The app's own header control, such as a menu of settings, before Close. */
  actions?: ReactNode;
  /** Ways the assistant can work in this app, such as Polemic's LaTeX and Writing. */
  modes?: {
    options: PanelMode[];
    value: string;
    onChange: (id: string) => void;
    hint?: string;
  };
}

/** The docked panel on the right: the same in every app, in the app's tint. */
export function AssistantPanel(props: AssistantPanelProps) {
  return (
    <aside className="assistant-panel" aria-label={t("Assistant")}>
      <header className="assistant-panel-head">
        <AssistantMark />
        <h2>{t("Assistant")}</h2>
        <span className="assistant-grow" />
        {props.onHistory && (
          <button
            type="button"
            className="assistant-icon"
            onClick={props.onHistory}
            title={t("Earlier conversations")}
          >
            <Icon name="history" />
          </button>
        )}
        {props.onFloat && (
          <button
            type="button"
            className="assistant-icon"
            onClick={props.onFloat}
            title={t("Float over the page")}
          >
            <Icon name="panel-bottom" />
          </button>
        )}
        <button
          type="button"
          className="assistant-icon"
          onClick={props.onNew}
          title={t("New conversation")}
        >
          <Icon name="square-pen" />
        </button>
        {props.actions}
        <button
          type="button"
          className="assistant-icon"
          onClick={props.onClose}
          title={t("Close")}
        >
          <Icon name="panel-right-close" />
        </button>
      </header>
      {props.modes && (
        <div className="assistant-modes">
          <div role="radiogroup" aria-label={t("Mode")} className="assistant-segmented">
            {props.modes.options.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={mode.id === props.modes?.value}
                onClick={() => props.modes?.onChange(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {props.modes.hint && (
            <span className="assistant-modes-hint">{props.modes.hint}</span>
          )}
        </div>
      )}
      <div className="assistant-panel-body">{props.children}</div>
      <div className="assistant-panel-foot">
        {props.composer}
        {props.footer}
      </div>
    </aside>
  );
}

/** Before the first question: the mark, what the assistant does here, and a few ways to start. */
export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="assistant-empty">
      <AssistantMark size="lg" />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
