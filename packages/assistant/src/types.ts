/**
 * The conversation as the model reads it, in the OpenAI chat shape that
 * Mistral, local models and our server all take. These match the server's
 * contract (`assistantMessage` in @scholarkit/contracts), which the apps'
 * public repositories don't have, so they are written out here.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type AssistantReply = Extract<ChatMessage, { role: "assistant" }>;

/** A tool the model may call, in the OpenAI shape. */
export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

/**
 * One model call: the history and tools in, the assistant message out,
 * with the reply's text streamed to `onText` as it comes. Our server, an
 * own key and a local model are each one of these.
 */
export type SendTurn = (
  messages: ChatMessage[],
  tools: ToolSpec[],
  onText: (delta: string) => void,
  signal?: AbortSignal,
) => Promise<AssistantReply>;

export type AssistantApp = "polemic" | "cursive" | "binder";
