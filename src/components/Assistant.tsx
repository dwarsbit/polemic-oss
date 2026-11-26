/**
 * The assistant in Polemic, from the shared parts of @scholarkit/assistant:
 * the Ask button next to the avatar, the floating bar over the editor (the
 * default), the docked panel on the right (the alternative), and the Ask
 * menu on a selection. Polemic adds its modes (LaTeX and Writing), its
 * change cards and the question before it compiles.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpenText,
  Check,
  ChevronDown,
  Eraser,
  Languages,
  MoreHorizontal,
  Scissors,
  Sparkles,
  Table,
  Wrench,
} from "lucide-react";
import {
  AnswerActions,
  AskBar,
  AskButton,
  AssistantFloating,
  AssistantPanel,
  Composer,
  ConversationView,
  DiffCard,
  EmptyState,
  SelectionMenu,
  Suggestions,
  UsageLine,
  lineDiff,
  useAskShortcut,
  type MenuGroup,
  type UsageSource,
} from "@scholarkit/assistant";
import { t } from "@scholarkit/i18n";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { aiConfigured, providerOf } from "@/lib/ai-providers";
import { describeProseChange } from "@/lib/assistant/edits";
import { readCursor } from "@/lib/editor-edits";
import { features } from "@/lib/target";
import {
  contextChips,
  useAssistantEntries,
  useAssistantStore,
  type ChangeCard,
} from "@/store/assistant";
import { useProjectStore } from "@/store/project";
import {
  readAssistantSource,
  useSettingsStore,
  type AssistantMode,
} from "@/store/settings";

const MODES: { id: AssistantMode; label: string; hint: string }[] = [
  { id: "latex", label: "LaTeX", hint: t("Fixes LaTeX, leaves your text alone") },
  {
    id: "writing",
    label: t("Writing"),
    hint: t("Polishes your text, keeps what it says"),
  },
];

function placeholder(mode: AssistantMode) {
  return mode === "writing"
    ? t("Can you make this paragraph clearer?")
    : t("How do I make this table fit the page?");
}

/** Where the answers come from, as the bar and the usage line say it. */
function useSource(): {
  label: string;
  usage: UsageSource | null;
  blocked: string | null;
} {
  const assistantSource = useSettingsStore((s) => s.assistantSource);
  const ai = useSettingsStore((s) => s.ai);
  const usage = useAssistantStore((s) => s.usage);
  const source = readAssistantSource(assistantSource, ai);
  if (source === "own") {
    const provider = providerOf(ai);
    if (!aiConfigured(ai) || provider === null)
      return {
        label: t("Set up a provider"),
        usage: null,
        blocked: t("Set up an AI provider in the assistant settings to ask."),
      };
    return {
      label: ai?.model ?? provider.name,
      usage: provider.needsKey
        ? { kind: "own-key", provider: provider.name }
        : { kind: "local", model: ai?.model ?? provider.name },
      blocked: null,
    };
  }
  const plan = usage?.plan;
  if (plan === "free")
    return {
      label: "Scholarkit AI",
      usage: null,
      blocked: features.ownAiProvider
        ? t(
            "The assistant on our model comes with Plus. On Free, use it with your own key or a model on your computer.",
          )
        : t(
            "The assistant on our model comes with Plus. On Free, use it in the desktop app with your own key or a model on your computer.",
          ),
    };
  return {
    label: "Scholarkit AI",
    usage:
      (plan === "plus" || plan === "pro") && usage?.assistant
        ? { kind: "ours", plan, usedPercent: usage.assistant.usedPercent }
        : null,
    blocked: null,
  };
}

/** Mode, compiling and settings: the menu in the bar and the panel's header. */
function OptionsMenu({ trigger }: { trigger: "mode" | "icon" }) {
  const mode = useSettingsStore((s) => s.assistantMode);
  const projectPath = useProjectStore((s) => s.project?.path ?? null);
  const compileAllowed = useSettingsStore(
    (s) => projectPath !== null && s.assistantCompileProjects.includes(projectPath),
  );
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "mode" ? (
          <button
            type="button"
            className="assistant-model"
            title={t("What the assistant helps with")}
          >
            {current.label}
            <ChevronDown className="size-3" />
          </button>
        ) : (
          <button type="button" className="assistant-icon" title={t("Options")}>
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("Helps with")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) =>
            void useSettingsStore.getState().setAssistantMode(value as AssistantMode)
          }
        >
          {MODES.map((m) => (
            <DropdownMenuRadioItem key={m.id} value={m.id}>
              <span className="flex flex-col">
                <span>{m.label}</span>
                <span className="text-2xs text-muted-foreground">{m.hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={compileAllowed}
          disabled={projectPath === null}
          onCheckedChange={(checked) => {
            if (projectPath !== null)
              void useSettingsStore
                .getState()
                .setAssistantCompile(projectPath, checked === true);
          }}
        >
          {t("Allow compiling")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem onSelect={() => useAssistantStore.getState().clear()}>
          {t("New conversation")}
        </DropdownMenuItem>
        {features.ownAiProvider && (
          <DropdownMenuItem
            onSelect={() => useSettingsStore.getState().openSettings("ai")}
          >
            {t("Assistant settings…")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A proposed change: what it does, a warning when it edits the text, the diff. */
function ChangeCardView({ card }: { card: ChangeCard }) {
  const state = card.state ?? "open";
  const diff = lineDiff(card.before, card.after);
  const first = diff.hunks[0]?.lines.find((l) => l.kind !== "same")?.number;
  return (
    <>
      {card.prose !== null && state === "open" && (
        <p className="assistant-note assistant-warn">
          {describeProseChange(card.prose)}
        </p>
      )}
      <DiffCard
        file={card.path}
        diff={diff}
        where={
          card.creates
            ? t("New file")
            : first !== undefined
              ? t("Line {line}", { line: first })
              : undefined
        }
        note={card.note ?? undefined}
        state={state}
        onApply={() => void useAssistantStore.getState().applyChange(card)}
        onDiscard={() => useAssistantStore.getState().discardChange(card)}
      />
    </>
  );
}

function renderCard(card: ChangeCard) {
  return <ChangeCardView card={card} />;
}

/** The question before the assistant compiles a project for the first time. */
function CompileRequest() {
  const request = useAssistantStore((s) => s.compileRequest);
  if (request === null) return null;
  const answer = useAssistantStore.getState().answerCompileRequest;
  return (
    <div
      className="assistant-card"
      role="alertdialog"
      aria-label={t("Allow compiling")}
    >
      <div className="assistant-card-head">
        {t(
          "Allow the assistant to compile this project? It saves your open files first. You can turn this off in its menu.",
        )}
      </div>
      <div className="assistant-card-foot">
        <span className="assistant-grow" />
        <AnswerActions
          actions={[
            { label: t("Don't allow"), onClick: () => answer(false) },
            {
              label: t("Allow compiling"),
              icon: "check",
              primary: true,
              onClick: () => answer(true),
            },
          ]}
        />
      </div>
    </div>
  );
}

/** Puts the cursor in the bar or the composer when asked to. */
function useFocusRequests() {
  const input = useRef<HTMLTextAreaElement>(null);
  const request = useAssistantStore((s) => s.focusRequest);
  useEffect(() => {
    if (request > 0) input.current?.focus();
  }, [request]);
  return input;
}

/** The draft and sending it, shared by the bar and the composer. */
function useDraft() {
  const [draft, setDraft] = useState("");
  const send = () => {
    const text = draft.trim();
    if (text === "" || useAssistantStore.getState().working()) return;
    setDraft("");
    void useAssistantStore.getState().ask(text);
  };
  return { draft, setDraft, send };
}

function removeChip(id: string) {
  useAssistantStore
    .getState()
    .setContext(id === "selection" ? { selection: null } : { issue: null });
}

/** The Ask button next to the avatar; Cmd+J does the same. */
export function AskAssistantButton() {
  const layout = useSettingsStore((s) => s.assistantLayout);
  const on = useAssistantStore((s) => (layout === "docked" ? s.dockShown : s.barOpen));
  const project = useProjectStore((s) => s.project);
  const toggle = useCallback(() => {
    // With text selected in the editor, the shortcut opens the Ask menu on it.
    if (readCursor()?.selection && !useAssistantStore.getState().barOpen) {
      useAssistantStore.getState().openMenu();
    } else {
      useAssistantStore.getState().toggle();
    }
  }, []);
  useAskShortcut(toggle, project !== null);
  if (project === null) return null;
  return <AskButton on={on} onClick={() => useAssistantStore.getState().toggle()} />;
}

/** The floating layout: the bar at the bottom of the editor, the latest answer above it. */
export function AssistantFloatingLayer() {
  const layout = useSettingsStore((s) => s.assistantLayout);
  const barOpen = useAssistantStore((s) => s.barOpen);
  const sheetOpen = useAssistantStore((s) => s.sheetOpen);
  const context = useAssistantStore((s) => s.context);
  const mode = useSettingsStore((s) => s.assistantMode);
  const { entries, working } = useAssistantEntries();
  const { draft, setDraft, send } = useDraft();
  const source = useSource();
  const input = useFocusRequests();
  if (layout !== "floating" || !barOpen) return null;
  const store = useAssistantStore.getState();
  return (
    <div
      onKeyDown={(e) => {
        // Escape closes the answer first, then the bar.
        if (e.key === "Escape" && !useAssistantStore.getState().sheetOpen) {
          e.preventDefault();
          store.hide();
        }
      }}
    >
      <AssistantFloating
        entries={entries}
        open={sheetOpen}
        onClose={() => store.setSheetOpen(false)}
        onDock={() => {
          void useSettingsStore.getState().setAssistantLayout("docked");
          useAssistantStore.setState({ barOpen: false });
          store.show();
        }}
        renderAttachment={renderCard}
        bar={
          <>
            <CompileRequest />
            <AskBar
              value={draft}
              onChange={setDraft}
              onSend={send}
              onStop={store.stop}
              working={working}
              placeholder={source.blocked ?? placeholder(mode)}
              chips={contextChips(context)}
              onRemoveChip={removeChip}
              model={source.label}
              onPickModel={
                features.ownAiProvider
                  ? () => useSettingsStore.getState().openSettings("ai")
                  : undefined
              }
              extra={<OptionsMenu trigger="mode" />}
              disabled={source.blocked !== null}
              inputRef={input}
            />
          </>
        }
      />
    </div>
  );
}

function suggestions(mode: AssistantMode) {
  return mode === "writing"
    ? [t("Make the abstract clearer"), t("Check the grammar of this section")]
    : [t("Why does my document not compile?"), t("Make this table fit the page")];
}

/** The docked layout: the whole conversation in the right panel. */
export function AssistantDock() {
  const context = useAssistantStore((s) => s.context);
  const mode = useSettingsStore((s) => s.assistantMode);
  const { entries, working } = useAssistantEntries();
  const { draft, setDraft, send } = useDraft();
  const source = useSource();
  const input = useFocusRequests();
  const store = useAssistantStore.getState();
  useEffect(() => {
    if (useAssistantStore.getState().usage === null)
      void useAssistantStore.getState().refreshUsage();
  }, []);
  return (
    <AssistantPanel
      onClose={store.hide}
      onNew={store.clear}
      onFloat={() => {
        store.hide();
        void useSettingsStore.getState().setAssistantLayout("floating");
        store.show();
      }}
      actions={<OptionsMenu trigger="icon" />}
      modes={{
        options: MODES,
        value: mode,
        onChange: (id) =>
          void useSettingsStore.getState().setAssistantMode(id as AssistantMode),
        hint: MODES.find((m) => m.id === mode)?.hint,
      }}
      composer={
        <>
          <CompileRequest />
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            onStop={store.stop}
            working={working}
            placeholder={placeholder(mode)}
            chips={contextChips(context)}
            onRemoveChip={removeChip}
            model={source.label}
            onPickModel={
              features.ownAiProvider
                ? () => useSettingsStore.getState().openSettings("ai")
                : undefined
            }
            disabled={source.blocked !== null}
            inputRef={input}
          />
        </>
      }
      footer={source.usage && <UsageLine source={source.usage} />}
    >
      <ConversationView
        entries={entries}
        renderAttachment={renderCard}
        empty={
          <EmptyState
            title={
              mode === "writing" ? t("Polish your writing") : t("Ask about your LaTeX")
            }
            text={
              source.blocked ??
              (mode === "writing"
                ? t(
                    "Ask for clearer, tighter or more correct wording. The assistant proposes changes you review, and never changes what your text says.",
                  )
                : t(
                    "Ask about errors, tables, floats, math or packages. The assistant reads your project and proposes changes you review.",
                  ))
            }
          >
            {source.blocked === null && (
              <Suggestions
                items={suggestions(mode).map((label) => ({
                  label,
                  onPick: () => void useAssistantStore.getState().ask(label),
                }))}
              />
            )}
          </EmptyState>
        }
      />
    </AssistantPanel>
  );
}

const ICON = "size-3.5";

function menuGroups(mode: AssistantMode): MenuGroup[] {
  return mode === "writing"
    ? [
        {
          label: t("Writing"),
          items: [
            {
              id: t("Make this clearer."),
              label: t("Make it clearer"),
              icon: <Sparkles className={ICON} />,
            },
            {
              id: t("Make this shorter."),
              label: t("Make it shorter"),
              icon: <Scissors className={ICON} />,
            },
            {
              id: t("Fix the grammar and spelling."),
              label: t("Fix grammar and spelling"),
              icon: <Check className={ICON} />,
            },
            {
              id: t("Make this more formal."),
              label: t("Make it more formal"),
              icon: <Languages className={ICON} />,
            },
          ],
        },
      ]
    : [
        {
          label: "LaTeX",
          items: [
            {
              id: t("Fix the LaTeX in this."),
              label: t("Fix the LaTeX"),
              icon: <Wrench className={ICON} />,
            },
            {
              id: t("Explain what this LaTeX does."),
              label: t("Explain this"),
              icon: <BookOpenText className={ICON} />,
            },
            {
              id: t("Turn this into a table."),
              label: t("Turn into a table"),
              icon: <Table className={ICON} />,
            },
            {
              id: t("Simplify the markup without changing the output."),
              label: t("Simplify the markup"),
              icon: <Eraser className={ICON} />,
            },
          ],
        },
      ];
}

/** The Ask menu under a selection in the editor. */
export function AssistantMenuLayer() {
  const menu = useAssistantStore((s) => s.menu);
  const mode = useSettingsStore((s) => s.assistantMode);
  if (menu === null) return null;
  const store = useAssistantStore.getState();
  const ask = (text: string) => {
    store.closeMenu();
    store.show();
    void store.ask(text);
  };
  // Kept on screen: the menu is 384px wide and about 300px tall.
  const left = Math.max(8, Math.min(menu.left, window.innerWidth - 392));
  const top = Math.min(menu.top, window.innerHeight - 320);
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onMouseDown={() => {
          store.closeMenu();
          store.setContext({ selection: null });
        }}
      />
      <div className="fixed z-50" style={{ left, top }}>
        <SelectionMenu
          groups={menuGroups(mode)}
          placeholder={t("Ask about the selection…")}
          onPick={ask}
          onAsk={ask}
          onClose={() => {
            store.closeMenu();
            store.setContext({ selection: null });
          }}
        />
      </div>
    </>,
    document.body,
  );
}
