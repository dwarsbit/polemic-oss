import { describe, expect, it } from "vitest";
import {
  AssistantError,
  errorFromServer,
  errorMessage,
  loadAccess,
  readEvents,
  serverTurn,
} from "./transport";

function sse(events: unknown[], chunk = 5): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
  );
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunk)
        c.enqueue(bytes.slice(i, i + chunk));
      c.close();
    },
  });
}

describe("readEvents", () => {
  it("reads events split anywhere, with Windows line ends too", async () => {
    const seen: unknown[] = [];
    await readEvents(sse([{ type: "text", delta: "é" }, { type: "done" }], 3), (e) =>
      seen.push(e),
    );
    const crlf = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: {"a":1}\r\n\r\ndata: {"a":2}'));
        c.close();
      },
    });
    await readEvents(crlf, (e) => seen.push(e));
    expect(seen).toEqual([
      { type: "text", delta: "é" },
      { type: "done" },
      { a: 1 },
      { a: 2 },
    ]);
  });
});

describe("serverTurn", () => {
  it("streams the text and resolves with the whole message", async () => {
    const asked: Array<{ url: string; init: RequestInit }> = [];
    let used = -1;
    const send = serverTurn({
      app: "cursive",
      baseUrl: "https://scholarkit.app",
      headers: () => ({ authorization: "Bearer t0ken" }),
      onUsage: (p) => (used = p),
      fetch: async (url, init) => {
        asked.push({ url: String(url), init: init! });
        return new Response(
          sse([
            { type: "text", delta: "Two " },
            { type: "text", delta: "reviews." },
            {
              type: "done",
              message: {
                role: "assistant",
                content: "Two reviews.",
                tool_calls: [
                  {
                    id: "x1",
                    type: "function",
                    function: { name: "search", arguments: "{}" },
                  },
                ],
              },
              usedPercent: 35,
            },
          ]),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    let text = "";
    const reply = await send([{ role: "user", content: "Hi" }], [], (d) => (text += d));
    expect(text).toBe("Two reviews.");
    expect(reply.tool_calls?.[0].function.name).toBe("search");
    expect(used).toBe(35);
    expect(asked[0].url).toBe("https://scholarkit.app/api/assistant/turn");
    expect(asked[0].init.credentials).toBe("include");
    expect(new Headers(asked[0].init.headers).get("authorization")).toBe(
      "Bearer t0ken",
    );
    expect(JSON.parse(String(asked[0].init.body))).toEqual({
      app: "cursive",
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
    });
  });

  it("turns the server's notices into codes the panel says in words", async () => {
    const answer = (
      status: number,
      error: string,
      headers: Record<string, string> = {},
    ) =>
      serverTurn({
        app: "binder",
        fetch: async () =>
          new Response(JSON.stringify({ error, message: "m" }), { status, headers }),
      })([], [], () => {});
    const codeOf = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return e instanceof AssistantError ? [e.code, e.retryAfterSeconds] : String(e);
      }
    };
    expect(await codeOf(answer(403, "plus_needed"))).toEqual(["plus_needed", null]);
    expect(
      await codeOf(answer(429, "assistant_used_up", { "retry-after": "3600" })),
    ).toEqual(["used_up", 3600]);
    expect(await codeOf(answer(429, "rate_limited", { "retry-after": "12" }))).toEqual([
      "rate_limited",
      12,
    ]);
    expect(await codeOf(answer(503, "assistant_off"))).toEqual(["off", null]);
    expect(await codeOf(answer(401, "whatever"))).toEqual(["signed_out", null]);
    expect(await codeOf(answer(502, ""))).toEqual(["model_unavailable", null]);
    expect(await codeOf(answer(500, ""))).toEqual(["failed", null]);
  });

  it("fails on an error event, and when the stream ends early", async () => {
    const streaming = (events: unknown[]) =>
      serverTurn({ app: "polemic", fetch: async () => new Response(sse(events)) })(
        [],
        [],
        () => {},
      );
    await expect(
      streaming([{ type: "error", error: "model_unavailable", message: "x" }]),
    ).rejects.toMatchObject({
      code: "model_unavailable",
    });
    await expect(streaming([{ type: "text", delta: "Hal" }])).rejects.toMatchObject({
      code: "model_unavailable",
    });
  });

  it("says when the network is down", async () => {
    const send = serverTurn({
      app: "polemic",
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const error = await send([], [], () => {}).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "offline" });
    expect(errorMessage(error)).toBe(
      "You're offline. The assistant needs a connection.",
    );
  });
});

describe("loadAccess", () => {
  it("reads the provider and the share used", async () => {
    const access = await loadAccess({
      app: "polemic",
      fetch: async () =>
        Response.json({
          provider: "Mistral",
          usedPercent: 12,
          resetsAt: "2026-12-01T00:00:00.000Z",
        }),
    });
    expect(access.provider).toBe("Mistral");
  });
});

describe("errorFromServer", () => {
  it("takes the server's codes and our own", () => {
    expect(errorFromServer("assistant_used_up", "").code).toBe("used_up");
    expect(errorFromServer("signed_out", "").code).toBe("signed_out");
    expect(errorFromServer("something_new", "Odd").code).toBe("failed");
  });

  it("says a provider's error as the app wrote it", () => {
    const error = errorFromServer("provider", "Mistral refused the key.");
    expect(errorMessage(error)).toBe("Mistral refused the key.");
  });
});
