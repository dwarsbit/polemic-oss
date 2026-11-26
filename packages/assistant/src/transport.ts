/**
 * The assistant on our model: each turn goes to `POST /api/assistant/turn`,
 * which passes it to the model we host for Plus and Pro and streams the
 * answer back as server-sent events. The apps run the tools themselves;
 * the server only sees the conversation. An own key or a local model
 * doesn't come here: the app passes its own `SendTurn`.
 */

import { t } from "@scholarkit/i18n";
import type { AssistantApp, AssistantReply, SendTurn, ToolCall } from "./types";

export type AssistantErrorCode =
  | "signed_out"
  | "plus_needed"
  | "used_up"
  | "rate_limited"
  | "too_long"
  | "off"
  | "model_unavailable"
  | "offline"
  | "provider"
  | "failed";

/** Why a turn didn't run; `errorMessage` says it to the person. */
export class AssistantError extends Error {
  constructor(
    readonly code: AssistantErrorCode,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "AssistantError";
  }
}

/** Where the assistant runs today: GET /api/assistant/access. */
export interface AssistantAccess {
  /** The model's maker, as the usage line names it. */
  provider: string;
  usedPercent: number;
  /** ISO time the month's share starts again. */
  resetsAt: string;
}

export interface ServerOptions {
  app: AssistantApp;
  /** The API's origin, such as https://scholarkit.app; empty on the web, where it is the page's own. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** The desktop apps' token; the web sends its session cookie instead. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Each finished turn's share of the month used. */
  onUsage?: (usedPercent: number) => void;
}

const CODES: Record<string, AssistantErrorCode> = {
  unauthorized: "signed_out",
  plus_needed: "plus_needed",
  assistant_used_up: "used_up",
  rate_limited: "rate_limited",
  too_long: "too_long",
  assistant_off: "off",
  model_unavailable: "model_unavailable",
  offline: "offline",
};

const OWN_CODES = new Set<string>([...Object.values(CODES), "provider", "failed"]);

/**
 * The error for one of the server's notices, as `{ error, message }` names
 * it, or for one of our own codes: for an app that reaches the server
 * another way, such as through its desktop shell.
 */
export function errorFromServer(
  code: string,
  message: string,
  retryAfterSeconds: number | null = null,
): AssistantError {
  const known = OWN_CODES.has(code) ? (code as AssistantErrorCode) : null;
  return new AssistantError(
    CODES[code] ?? known ?? "failed",
    message || code,
    retryAfterSeconds,
  );
}

async function errorOf(res: Response): Promise<AssistantError> {
  let code = "";
  let message = "";
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    if (typeof body.error === "string") code = body.error;
    if (typeof body.message === "string") message = body.message;
  } catch {
    // Not our JSON: a proxy's page. The status says enough.
  }
  const retry = Number(res.headers.get("retry-after"));
  const mapped =
    CODES[code] ??
    (res.status === 401
      ? "signed_out"
      : res.status === 413
        ? "too_long"
        : res.status === 502 || res.status === 504
          ? "model_unavailable"
          : "failed");
  return new AssistantError(
    mapped,
    message || `HTTP ${res.status}`,
    Number.isFinite(retry) && retry > 0 ? retry : null,
  );
}

async function request(
  options: ServerOptions,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const doFetch = options.fetch ?? globalThis.fetch;
  const headers = {
    ...(await options.headers?.()),
    ...(init.headers as Record<string, string>),
  };
  try {
    return await doFetch(`${options.baseUrl ?? ""}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new AssistantError("offline", e instanceof Error ? e.message : String(e));
  }
}

/** Whether this account may use our model, and how much of the month it used. */
export async function loadAccess(options: ServerOptions): Promise<AssistantAccess> {
  const res = await request(options, "/api/assistant/access", { method: "GET" });
  if (!res.ok) throw await errorOf(res);
  return (await res.json()) as AssistantAccess;
}

/** Reads `data:` events from a server-sent event stream, one JSON object each. */
export async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object")
      onEvent(parsed as Record<string, unknown>);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      flush(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
    }
  }
  flush(buffer + decoder.decode());
}

function replyOf(message: unknown): AssistantReply {
  const m = (message ?? {}) as { content?: unknown; tool_calls?: unknown };
  const calls = Array.isArray(m.tool_calls) ? (m.tool_calls as ToolCall[]) : [];
  const content = typeof m.content === "string" ? m.content : "";
  return calls.length > 0
    ? { role: "assistant", content, tool_calls: calls }
    : { role: "assistant", content };
}

/** A `SendTurn` on our server, for one app. */
export function serverTurn(options: ServerOptions): SendTurn {
  return async (messages, tools, onText, signal) => {
    const res = await request(options, "/api/assistant/turn", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ app: options.app, messages, tools }),
      signal,
    });
    if (!res.ok || !res.body) throw await errorOf(res);
    let reply: AssistantReply | null = null;
    let failure: AssistantError | null = null;
    await readEvents(res.body, (event) => {
      if (event.type === "text" && typeof event.delta === "string") onText(event.delta);
      else if (event.type === "done") {
        reply = replyOf(event.message);
        if (typeof event.usedPercent === "number") options.onUsage?.(event.usedPercent);
      } else if (event.type === "error") {
        const code = typeof event.error === "string" ? event.error : "";
        failure = new AssistantError(
          CODES[code] ?? "model_unavailable",
          typeof event.message === "string" ? event.message : code,
        );
      }
    });
    if (failure) throw failure;
    if (!reply)
      throw new AssistantError("model_unavailable", "The stream ended early.");
    return reply;
  };
}

/** What went wrong, for the person, in the active language. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof AssistantError)) return t("The assistant stopped. Try again.");
  switch (error.code) {
    case "signed_out":
      return t("Sign in to use the assistant.");
    case "plus_needed":
      return t(
        "The assistant on our model comes with Plus. Use your own key or a local model on Free.",
      );
    case "used_up":
      return t(
        "You've used all of this month's assistant on your plan. It starts again on the 1st, or add your own key in the settings.",
      );
    case "rate_limited":
      return t("Too many questions at once. Wait a moment.");
    case "too_long":
      return t(
        "This conversation is too long for the assistant. Start a new conversation.",
      );
    case "off":
      return t("The assistant isn't set up on this server.");
    case "model_unavailable":
      return t("The model didn't answer. Try again.");
    case "offline":
      return t("You're offline. The assistant needs a connection.");
    case "provider":
      // From the app's own provider, already written for the person.
      return error.message;
    case "failed":
      return t("The assistant stopped. Try again.");
  }
}
