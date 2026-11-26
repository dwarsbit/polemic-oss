/**
 * The assistant's state in Polemic: one conversation per project, run by
 * the shared `Conversation` of @scholarkit/assistant with Polemic's tools,
 * and what the next question carries (a selection, a compile issue). The
 * answers come from our model (Plus and Pro) or the provider set up in
 * settings; see `readAssistantSource`.
 */

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import {
  AssistantError,
  Conversation,
  type CardState,
  type ContextChipData,
  type Entry,
  type SendTurn,
} from "@scholarkit/assistant";
import { t } from "@scholarkit/i18n";
import {
  modeNote,
  systemPrompt,
  userMessage,
  type AskContext,
} from "@/lib/assistant/agent";
import { planReplacements } from "@/lib/assistant/edits";
import {
  describeStart,
  polemicKit,
  type AssistantHost,
  type CompileResult,
  type ProposedChange,
} from "@/lib/assistant/tools";
import { aiConfigured } from "@/lib/ai-providers";
import { readCursor } from "@/lib/editor-edits";
import { errorText } from "@/lib/error-text";
import { applyFixEdits } from "@/lib/fix-issue";
import { runPanelCommand } from "@/lib/panel-commands";
import { currentText, writeFileEdits } from "@/lib/project-texts";
import { features } from "@/lib/target";
import {
  accountUsage,
  aiAgentTurn,
  aiCancel,
  assistantTurn,
  texPackageInfo,
  writeProjectFile,
  type AccountUsage,
  type CompileIssue,
  type FileEntry,
} from "@/lib/tauri";
import { useEditorStore } from "@/store/editor";
import { usePreviewStore } from "@/store/preview";
import { useProjectStore } from "@/store/project";
import {
  compilesInCloud,
  readAssistantSource,
  useSettingsStore,
  type AssistantMode,
} from "@/store/settings";

/** A proposed change as its card shows it: open until applied or discarded. */
export type ChangeCard = ProposedChange & {
  state?: CardState;
  /** Why applying failed, shown on the card. */
  note?: string | null;
};

/** What the next question carries besides its text. */
export interface PendingContext {
  selection: AskContext["selection"];
  issue: CompileIssue | null;
}

/** Where the Ask menu opens: under the selection, in window coordinates. */
export interface MenuAnchor {
  left: number;
  top: number;
}

interface AssistantState {
  /** The project the conversation belongs to. */
  projectPath: string | null;
  context: PendingContext;
  /** Set while the assistant waits for the user to allow compiling. */
  compileRequest: { resolve: (allowed: boolean) => void } | null;
  /** The floating bar shows (in the floating layout). */
  barOpen: boolean;
  /** The sheet with the latest answer shows above the bar. */
  sheetOpen: boolean;
  /** The docked panel shows (in the docked layout); the editor reports it. */
  dockShown: boolean;
  /** The Ask menu on a selection, while open. */
  menu: MenuAnchor | null;
  /** What the account may use of our model; null until loaded or when signed out. */
  usage: AccountUsage | null;
  /** Bumped to put the cursor in the bar or the composer. */
  focusRequest: number;
  ask: (text: string) => Promise<void>;
  /** Whether a question is being answered now. */
  working: () => boolean;
  stop: () => void;
  clear: () => void;
  setContext: (context: Partial<PendingContext>) => void;
  applyChange: (card: ChangeCard) => Promise<void>;
  discardChange: (card: ChangeCard) => void;
  answerCompileRequest: (allowed: boolean) => void;
  /** Starts over when another project is open. */
  syncProject: (path: string | null) => void;
  /** Shows the assistant in the current layout, with the cursor in it. */
  show: () => void;
  /** The Ask button and Cmd+J: shows or hides it. */
  toggle: () => void;
  hide: () => void;
  setSheetOpen: (open: boolean) => void;
  setDockShown: (shown: boolean) => void;
  /** The Ask menu on the editor's selection; without one, the assistant itself. */
  openMenu: () => void;
  closeMenu: () => void;
  refreshUsage: () => Promise<void>;
}

const EMPTY_CONTEXT: PendingContext = { selection: null, issue: null };

let nextRequest = 1;
/** Changes proposed in this conversation, for their numbers. */
let changes = 0;
/** Outcomes of change cards since the last question, told to the model with the next one. */
let notes: string[] = [];
/** The mode the model was last told about. */
let toldMode: AssistantMode | null = null;
/** The store's conversation, for components; set when the store is made. */
let assistantConversation: Conversation<ChangeCard> | null = null;

function flatten(entries: FileEntry[], out: string[] = []): string[] {
  for (const entry of entries) {
    if (entry.isDir) flatten(entry.children, out);
    else out.push(entry.path);
  }
  return out;
}

/** The selection as its chip names it. */
export function selectionLabel(selection: NonNullable<PendingContext["selection"]>) {
  const name = selection.path.split("/").pop() ?? selection.path;
  return selection.fromLine === selection.toLine
    ? t("{file}, line {line}", { file: name, line: selection.fromLine })
    : t("{file}, lines {from}–{to}", {
        file: name,
        from: selection.fromLine,
        to: selection.toLine,
      });
}

/** The chips for what the next question carries. */
export function contextChips(context: PendingContext): ContextChipData[] {
  const chips: ContextChipData[] = [];
  if (context.selection !== null)
    chips.push({
      id: "selection",
      label: selectionLabel(context.selection),
      icon: "text-select",
    });
  if (context.issue !== null)
    chips.push({
      id: "issue",
      label: context.issue.message,
      icon: "circle-alert",
      tone: "error",
    });
  return chips;
}

/** One turn on whichever model answers now. */
const send: SendTurn = async (messages, tools, onText, signal) => {
  const { assistantSource, ai } = useSettingsStore.getState();
  const source = readAssistantSource(assistantSource, ai);
  const requestId = nextRequest++;
  const cancel = () => void aiCancel(requestId).catch(() => {});
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (source === "scholarkit") {
      return await assistantTurn({ messages, tools, requestId }, onText);
    }
    if (ai === null || !aiConfigured(ai)) {
      throw new AssistantError(
        "provider",
        t("No AI provider is set up. Add one in the assistant settings."),
      );
    }
    try {
      return await aiAgentTurn(
        {
          baseUrl: ai.baseUrl!,
          apiKey: ai.apiKey ?? "",
          model: ai.model!,
          messages,
          tools,
          requestId,
        },
        onText,
      );
    } catch (e) {
      if (signal?.aborted || e === "cancelled") throw e;
      throw new AssistantError("provider", errorText(e));
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
};

export const useAssistantStore = create<AssistantState>((set, get) => {
  async function compile(): Promise<CompileResult | null> {
    const project = useProjectStore.getState().project;
    if (project === null) throw new Error("no project is open");
    const settings = useSettingsStore.getState();
    if (!settings.assistantCompileProjects.includes(project.path)) {
      const allowed = await new Promise<boolean>((resolve) =>
        set({ compileRequest: { resolve } }),
      );
      set({ compileRequest: null });
      if (!allowed || !conversation.working) return null;
      await settings.setAssistantCompile(project.path, true);
    }
    // The compile reads the files on disk: save what the user (and
    // applied changes) left in the editor first.
    await useProjectStore
      .getState()
      .saveActiveFile({ background: true })
      .catch(() => false);
    await useProjectStore.getState().flushBuffers();
    await usePreviewStore.getState().compileNow();
    const preview = usePreviewStore.getState();
    if (preview.error !== null && preview.issues.length === 0) {
      throw new Error(preview.error);
    }
    return { success: preview.status === "ok", issues: preview.issues };
  }

  const host: AssistantHost = {
    listFiles: () => flatten(useProjectStore.getState().files),
    mainFile: () => useProjectStore.getState().mainFile,
    readFile: (path) => currentText(path),
    issues: () => usePreviewStore.getState().issues,
    compile,
    packageInfo: (names) => texPackageInfo(names),
    propose: () => ++changes,
    mode: () => useSettingsStore.getState().assistantMode,
  };

  const conversation = new Conversation<ChangeCard>({
    send,
    kit: polemicKit(host, features.localTex),
    system: () => {
      toldMode = useSettingsStore.getState().assistantMode;
      return systemPrompt(toldMode, features.localTex);
    },
    describeStart,
  });
  assistantConversation = conversation;

  const reset = () => {
    get().compileRequest?.resolve(false);
    conversation.reset();
    changes = 0;
    notes = [];
    toldMode = null;
  };

  const focus = () => set({ focusRequest: get().focusRequest + 1 });

  return {
    projectPath: null,
    context: EMPTY_CONTEXT,
    compileRequest: null,
    barOpen: false,
    sheetOpen: false,
    dockShown: false,
    menu: null,
    usage: null,
    focusRequest: 0,

    ask: async (text) => {
      const question = text.trim();
      if (question === "" || conversation.working) return;
      const { assistantMode } = useSettingsStore.getState();
      const { activeFile } = useProjectStore.getState();
      const { context } = get();
      const cursor = readCursor();
      const askContext: AskContext = {
        activeFile,
        cursorLine: cursor?.line ?? null,
        selection: context.selection,
        issue: context.issue,
        cloud: compilesInCloud(),
      };
      const prefix: string[] = [...notes];
      if (toldMode !== null && toldMode !== assistantMode) {
        prefix.push(modeNote(assistantMode));
        toldMode = assistantMode;
      }
      notes = [];
      const forModel =
        (prefix.length > 0 ? `${prefix.join(" ")}\n\n` : "") +
        userMessage(question, askContext);
      set({ context: EMPTY_CONTEXT, sheetOpen: true, menu: null });
      const outcome = await conversation.ask({
        text: question,
        forModel,
        chips: contextChips(context),
      });
      const { assistantSource, ai } = useSettingsStore.getState();
      if (
        outcome !== "failed" &&
        readAssistantSource(assistantSource, ai) === "scholarkit"
      )
        void get().refreshUsage();
    },

    working: () => conversation.working,

    stop: () => {
      conversation.stop();
      get().compileRequest?.resolve(false);
    },

    clear: () => {
      reset();
      set({ context: EMPTY_CONTEXT, sheetOpen: false });
      focus();
    },

    setContext: (context) => set({ context: { ...get().context, ...context } }),

    applyChange: async (card) => {
      if ((card.state ?? "open") !== "open") return;
      const project = useProjectStore.getState().project;
      if (project === null) return;
      const fail = (note: string) => conversation.update(card, { ...card, note });
      try {
        const current = await currentText(card.path);
        if (card.creates) {
          if (current !== null)
            return fail(t("{path} exists now. Ask again.", { path: card.path }));
          await writeProjectFile(project.path, card.path, card.after);
          await useProjectStore.getState().refreshFiles();
        } else {
          if (current === null)
            return fail(t("{path} is gone. Ask again.", { path: card.path }));
          const planned = planReplacements(current, card.replacements);
          if ("error" in planned) {
            return fail(t("The file has changed since this was proposed. Ask again."));
          }
          if (card.path === useProjectStore.getState().activeFile) {
            applyFixEdits(planned.edits);
            const line = current.slice(0, planned.edits[0].from).split("\n").length;
            useEditorStore.getState().jumpTo(line);
          } else {
            await writeFileEdits(card.path, current, planned.edits, "input.assistant");
          }
        }
      } catch (e) {
        return fail(errorText(e));
      }
      conversation.update(card, { ...card, state: "applied", note: null });
      notes.push(`The user applied change ${card.id}.`);
      // The button is gone: the cursor goes back to where the user asks.
      focus();
    },

    discardChange: (card) => {
      if ((card.state ?? "open") !== "open") return;
      conversation.update(card, { ...card, state: "discarded", note: null });
      notes.push(`The user discarded change ${card.id}.`);
      focus();
    },

    answerCompileRequest: (allowed) => get().compileRequest?.resolve(allowed),

    syncProject: (path) => {
      if (path === get().projectPath) return;
      reset();
      set({ projectPath: path, context: EMPTY_CONTEXT, sheetOpen: false, menu: null });
    },

    show: () => {
      if (useSettingsStore.getState().assistantLayout === "docked") {
        runPanelCommand("show-assistant");
      } else {
        set({ barOpen: true, sheetOpen: conversation.entries.length > 0 });
      }
      focus();
      if (get().usage === null) void get().refreshUsage();
    },

    toggle: () => {
      const docked = useSettingsStore.getState().assistantLayout === "docked";
      const shown = docked ? get().dockShown : get().barOpen;
      if (shown) get().hide();
      else get().show();
    },

    hide: () => {
      if (useSettingsStore.getState().assistantLayout === "docked") {
        runPanelCommand("hide-assistant");
      } else {
        set({ barOpen: false, sheetOpen: false });
      }
    },

    setSheetOpen: (open) => set({ sheetOpen: open }),
    setDockShown: (shown) => set({ dockShown: shown }),

    openMenu: () => {
      const path = useProjectStore.getState().activeFile;
      const cursor = readCursor();
      if (path === null || !cursor?.selection) {
        get().show();
        return;
      }
      const { anchor, ...selection } = cursor.selection;
      set({
        context: { ...get().context, selection: { path, ...selection } },
        menu: anchor ?? null,
      });
      // Without a place on screen (the Visual face), the bar asks instead.
      if (!anchor) get().show();
    },

    closeMenu: () => set({ menu: null }),

    refreshUsage: async () => {
      try {
        set({ usage: await accountUsage() });
      } catch {
        // Signed out or offline: the usage line stays away.
        set({ usage: null });
      }
    },
  };
});

function theConversation(): Conversation<ChangeCard> {
  if (assistantConversation === null) useAssistantStore.getState();
  return assistantConversation!;
}

/** The conversation's entries and whether it is working, for components. */
export function useAssistantEntries(): {
  entries: Entry<ChangeCard>[];
  working: boolean;
} {
  const conversation = theConversation();
  const entries = useSyncExternalStore(
    (listener) => conversation.subscribe(listener),
    () => conversation.entries,
  );
  return { entries, working: conversation.working };
}
