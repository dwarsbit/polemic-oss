/**
 * The assistant's loop, the same in every app: send the conversation and
 * the tools to the model, run the tool calls it asks for, feed the results
 * back, and repeat until it answers in plain text (or the step limit is
 * hit). The model is passed in, so the loop runs against a fake in tests.
 */

import type { Toolkit, ToolArgs } from "./tools";
import type { ChatMessage, SendTurn, ToolCall } from "./types";

export const MAX_STEPS = 12;

/** A tool result longer than this is cut, to keep small models usable. */
export const MAX_RESULT = 12_000;

/** One tool call, as the step list shows it. */
export interface Step {
  tool: string;
  label: string;
  ok: boolean;
}

export interface RunCallbacks<A> {
  onText: (delta: string) => void;
  /** A new model call starts; the reply text so far was not the last. */
  onTurn?: () => void;
  /** A tool call is about to run: `ask` tools wait for the person here. */
  onStepStart?: (tool: string, kind: "read" | "propose" | "ask") => void;
  onStep: (step: Step) => void;
  onAttachment?: (attachment: A) => void;
  signal?: AbortSignal;
}

export type RunOutcome = "done" | "limit" | "cancelled";

function parseArgs(call: ToolCall): ToolArgs | null {
  try {
    const parsed: unknown = JSON.parse(call.function.arguments || "{}");
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ToolArgs)
      : null;
  } catch {
    return null;
  }
}

function cut(text: string): string {
  return text.length > MAX_RESULT
    ? `${text.slice(0, MAX_RESULT)}\n… (cut: ${text.length - MAX_RESULT} more characters)`
    : text;
}

/**
 * Runs the loop on `history` (system message first, the new user message
 * last), appending every message to it, so the next question carries the
 * whole conversation. Resolves when the model answers without tool calls,
 * after MAX_STEPS turns or once `signal` aborts. The model's errors reject.
 */
export async function runAgent<A>(
  history: ChatMessage[],
  kit: Toolkit<A>,
  send: SendTurn,
  callbacks: RunCallbacks<A>,
): Promise<RunOutcome> {
  const stopped = () => callbacks.signal?.aborted ?? false;
  for (let step = 0; step < MAX_STEPS; step++) {
    if (stopped()) return "cancelled";
    callbacks.onTurn?.();
    let reply;
    try {
      reply = await send(history, kit.specs, callbacks.onText, callbacks.signal);
    } catch (e) {
      if (stopped()) return "cancelled";
      throw e;
    }
    const calls = reply.tool_calls ?? [];
    history.push(
      calls.length > 0
        ? { role: "assistant", content: reply.content ?? "", tool_calls: calls }
        : { role: "assistant", content: reply.content ?? "" },
    );
    if (calls.length === 0) return "done";
    // Every call gets its answer, even once stopped: the model's APIs
    // refuse a conversation with a call left unanswered.
    for (const call of calls) {
      history.push({
        role: "tool",
        tool_call_id: call.id,
        content: await answer(call),
      });
    }
    if (stopped()) return "cancelled";
  }
  return "limit";

  async function answer(call: ToolCall): Promise<string> {
    if (stopped()) return "Stopped by the user.";
    const tool = kit.get(call.function.name);
    if (!tool) return `Error: there is no tool named ${call.function.name}.`;
    const args = parseArgs(call);
    if (args === null) return "Error: the arguments were not a JSON object.";
    callbacks.onStepStart?.(tool.name, tool.kind);
    let result: string;
    let ok = true;
    try {
      const outcome = await tool.run(args);
      if (typeof outcome === "string") result = outcome;
      else {
        result = outcome.result;
        if (outcome.attachment !== undefined)
          callbacks.onAttachment?.(outcome.attachment);
      }
    } catch (e) {
      ok = false;
      result = `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
    callbacks.onStep({ tool: tool.name, label: tool.describe(args, result), ok });
    return cut(result);
  }
}
