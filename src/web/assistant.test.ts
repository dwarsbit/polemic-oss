import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantError } from "@scholarkit/assistant";
import { assistantNotice } from "@/lib/tauri";
import { assistantCommands } from "@/web/assistant";
import { Channel } from "@/web/core";

afterEach(() => vi.unstubAllGlobals());

const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });

describe("the assistant in the browser", () => {
  it("streams a turn from the server", async () => {
    const fetch = vi.fn(async () =>
      sse([
        { type: "text", delta: "Hi" },
        { type: "done", message: { role: "assistant", content: "Hi" } },
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    const onEvent = new Channel<{ kind: "text"; delta: string }>();
    const texts: string[] = [];
    onEvent.onmessage = (e) => texts.push(e.delta);
    const reply = await assistantCommands.assistant_turn({
      args: { messages: [{ role: "user", content: "Hello" }], tools: [], requestId: 1 },
      onEvent,
    });
    expect(reply).toEqual({ role: "assistant", content: "Hi" });
    expect(texts).toEqual(["Hi"]);
    expect(fetch).toHaveBeenCalledWith("/api/assistant/turn", expect.anything());
  });

  it("says the server's notice the way the desktop app does", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { error: "plus_needed", message: "Comes with Plus." },
        { status: 403 },
      ),
    );
    const failure = await Promise.resolve(
      assistantCommands.assistant_turn({
        args: { messages: [], tools: [], requestId: 2 },
        onEvent: new Channel(),
      }),
    ).catch((e: unknown) => e);
    expect(failure).toBe("assistant:plus_needed:Comes with Plus.");
    const error = assistantNotice(failure);
    expect(error).toBeInstanceOf(AssistantError);
    expect((error as AssistantError).code).toBe("plus_needed");
  });
});
