/**
 * A conversation as the panel shows it: the person's questions and the
 * assistant's turns, each with its steps, its text and its cards. It runs
 * the agent loop and keeps the model's history beside it, so the next
 * question carries everything before it. Plain state with a listener, so
 * it works without React too; `useConversation` wraps it for components.
 */

import { runAgent, type RunOutcome, type Step } from "./agent";
import type { Toolkit } from "./tools";
import type { ChatMessage, SendTurn } from "./types";

/** Something the question is about, shown above it: a file, a selection, an error. */
export interface ContextChip {
  id: string;
  label: string;
  /** Lucide-style icon name from `icons.tsx`, or a node the app draws. */
  icon?: string;
  tone?: "error";
}

export interface UserEntry {
  kind: "user";
  id: number;
  text: string;
  chips: ContextChip[];
}

export type TurnStatus =
  "working" | "waiting" | "done" | "limit" | "stopped" | "failed";

export interface AssistantEntry<A> {
  kind: "assistant";
  id: number;
  /** The last turn's text: what the assistant concluded. */
  text: string;
  steps: Step[];
  /** The step running now, while working. */
  current: string | null;
  attachments: A[];
  status: TurnStatus;
  error: unknown;
}

export type Entry<A> = UserEntry | AssistantEntry<A>;

export interface ConversationOptions<A> {
  send: SendTurn;
  kit: Toolkit<A>;
  /** The system message: what the assistant is and how it works in this app. */
  system: () => string;
  /** The step running now as the person reads it, such as "Reading main.tex…". */
  describeStart?: (tool: string) => string;
}

export interface Question {
  /** As the person typed it. */
  text: string;
  /** As the model reads it, with the context written out; the text when left out. */
  forModel?: string;
  chips?: ContextChip[];
}

export class Conversation<A = never> {
  entries: Entry<A>[] = [];
  private history: ChatMessage[] = [];
  private controller: AbortController | null = null;
  private listeners = new Set<() => void>();
  private nextId = 1;

  constructor(private options: ConversationOptions<A>) {}

  /** Takes the app's latest model, tools and system message, for the next question. */
  configure(options: ConversationOptions<A>) {
    this.options = options;
  }

  get working(): boolean {
    return this.controller !== null;
  }

  /** The model's view of it so far. */
  get messages(): readonly ChatMessage[] {
    return this.history;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    // A new array each time, so React sees the change.
    this.entries = [...this.entries];
    for (const listener of this.listeners) listener();
  }

  private patch(id: number, change: Partial<AssistantEntry<A>>) {
    this.entries = this.entries.map((e) =>
      e.id === id && e.kind === "assistant" ? { ...e, ...change } : e,
    );
    this.emit();
  }

  private entry(id: number): AssistantEntry<A> {
    return this.entries.find(
      (e): e is AssistantEntry<A> => e.id === id && e.kind === "assistant",
    )!;
  }

  /** Asks; resolves when the assistant has answered, stopped or failed. */
  async ask(question: Question): Promise<RunOutcome | "failed"> {
    if (this.controller) throw new Error("The assistant is still working.");
    const controller = new AbortController();
    this.controller = controller;
    if (this.history.length === 0)
      this.history.push({ role: "system", content: this.options.system() });
    const before = this.history.length;
    this.history.push({ role: "user", content: question.forModel ?? question.text });
    const id = this.nextId + 1;
    this.entries.push(
      {
        kind: "user",
        id: this.nextId,
        text: question.text,
        chips: question.chips ?? [],
      },
      {
        kind: "assistant",
        id,
        text: "",
        steps: [],
        current: null,
        attachments: [],
        status: "working",
        error: null,
      },
    );
    this.nextId += 2;
    this.emit();

    let text = "";
    let earlier = "";
    try {
      const outcome = await runAgent(
        this.history,
        this.options.kit,
        this.options.send,
        {
          signal: controller.signal,
          onTurn: () => {
            if (text.trim()) earlier = text;
            text = "";
          },
          onText: (delta) => {
            text += delta;
            this.patch(id, { text });
          },
          onStepStart: (tool, kind) =>
            this.patch(id, {
              current: this.options.describeStart?.(tool) ?? null,
              status: kind === "ask" ? "waiting" : "working",
            }),
          onStep: (step) =>
            this.patch(id, {
              steps: [...this.entry(id).steps, step],
              current: null,
              status: "working",
            }),
          onAttachment: (attachment) =>
            this.patch(id, {
              attachments: [...this.entry(id).attachments, attachment],
            }),
        },
      );
      this.patch(id, {
        // A last turn with only tool calls keeps the text before them.
        text: text.trim() ? text : earlier,
        current: null,
        status: outcome === "done" ? "done" : outcome === "limit" ? "limit" : "stopped",
      });
      return outcome;
    } catch (error) {
      // The model never saw this question through: leave it out of what it reads next.
      this.history.length = before;
      this.patch(id, {
        text: text.trim() ? text : earlier,
        current: null,
        status: "failed",
        error,
      });
      return "failed";
    } finally {
      this.controller = null;
      this.emit();
    }
  }

  stop() {
    this.controller?.abort();
  }

  /** Starts over: a new conversation. */
  reset() {
    this.stop();
    this.history = [];
    this.entries = [];
    this.emit();
  }

  /** Changes an attachment in place, such as a card the person applied. */
  update(attachment: A, next: A) {
    this.entries = this.entries.map((e) =>
      e.kind === "assistant" && e.attachments.includes(attachment)
        ? { ...e, attachments: e.attachments.map((a) => (a === attachment ? next : a)) }
        : e,
    );
    this.emit();
  }
}
