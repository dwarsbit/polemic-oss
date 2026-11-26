/**
 * The assistant in the browser: each turn goes to our model through the
 * server (`POST /api/assistant/turn`), signed in with the session cookie,
 * as the desktop app's `assistant_turn` command does with its token. The
 * tools run in the page. An own key or a local model stays a desktop
 * feature: the browser would send the key to the provider from the page.
 */

import { AssistantError, serverTurn } from "@scholarkit/assistant";
import type { Channel } from "@/web/core";

const send = serverTurn({ app: "polemic" });

/** Turns running now, by the request id the store chose, for ai_cancel. */
const running = new Map<number, AbortController>();

export const assistantCommands: Record<
  string,
  (args: Record<string, unknown>) => unknown
> = {
  assistant_turn: async (args) => {
    const { messages, tools, requestId } = args.args as {
      messages: Parameters<typeof send>[0];
      tools: Parameters<typeof send>[1];
      requestId: number;
    };
    const onEvent = args.onEvent as Channel<{ kind: "text"; delta: string }>;
    const controller = new AbortController();
    running.set(requestId, controller);
    try {
      return await send(
        messages,
        tools,
        (delta) => onEvent.onmessage({ kind: "text", delta }),
        controller.signal,
      );
    } catch (e) {
      if (controller.signal.aborted) throw "cancelled";
      // As the desktop shell says it: the store reads the code back.
      if (e instanceof AssistantError) throw `assistant:${e.code}:${e.message}`;
      throw e;
    } finally {
      running.delete(requestId);
    }
  },
  ai_cancel: (args) => {
    running.get(args.requestId as number)?.abort();
  },
};
