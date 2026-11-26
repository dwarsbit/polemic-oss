import { describe, expect, it } from "vitest";
import { Conversation, type AssistantEntry } from "./conversation";
import { toolkit } from "./tools";
import type { AssistantReply, SendTurn } from "./types";

const kit = toolkit<string>([
  {
    name: "search",
    description: "Search.",
    parameters: { type: "object" },
    kind: "read",
    run: async () => ({ result: "3 papers", attachment: "papers" }),
    describe: () => "Searched",
  },
  {
    name: "compile",
    description: "Compile.",
    parameters: { type: "object" },
    kind: "ask",
    run: async () => "ok",
    describe: () => "Compiled",
  },
]);

const toolCall = (name: string): AssistantReply => ({
  role: "assistant",
  content: "Let me look.",
  tool_calls: [{ id: name, type: "function", function: { name, arguments: "{}" } }],
});

function model(replies: AssistantReply[]): SendTurn {
  return async (_m, _t, onText) => {
    const reply = replies.shift() ?? { role: "assistant", content: "" };
    for (const word of reply.content.split(/(?<= )/)) onText(word);
    return reply;
  };
}

const last = (c: Conversation<string>) =>
  c.entries[c.entries.length - 1] as AssistantEntry<string>;

describe("Conversation", () => {
  it("shows the question, the steps, the cards and the last turn's text", async () => {
    const c = new Conversation<string>({
      send: model([
        toolCall("search"),
        { role: "assistant", content: "Two reviews back it." },
      ]),
      kit,
      system: () => "You are the assistant inside Cursive.",
    });
    const seen: string[] = [];
    c.subscribe(() => seen.push(last(c)?.status));
    expect(
      await c.ask({ text: "Find a source", forModel: "Selected: …\n\nFind a source" }),
    ).toBe("done");
    expect(c.entries[0]).toMatchObject({ kind: "user", text: "Find a source" });
    expect(last(c)).toMatchObject({
      text: "Two reviews back it.",
      steps: [{ label: "Searched", ok: true }],
      attachments: ["papers"],
      status: "done",
    });
    expect(c.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(c.messages[1].content).toContain("Selected:");
    expect(seen).toContain("working");
    expect(c.working).toBe(false);
  });

  it("keeps the text before the tools when the last turn has none", async () => {
    const c = new Conversation<string>({
      send: model([toolCall("search"), { role: "assistant", content: "" }]),
      kit,
      system: () => "",
    });
    await c.ask({ text: "Go" });
    expect(last(c).text).toBe("Let me look.");
  });

  it("waits while an ask tool asks the person", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const c = new Conversation<string>({
      send: model([toolCall("compile")]),
      kit: toolkit<string>([
        { ...kit.get("compile")!, run: async () => (await gate, "ok") },
      ]),
      system: () => "",
      describeStart: () => "Waiting for you to allow compiling",
    });
    const done = c.ask({ text: "Compile" });
    await new Promise((r) => setTimeout(r, 0));
    expect(last(c)).toMatchObject({
      status: "waiting",
      current: "Waiting for you to allow compiling",
    });
    release();
    await done;
    expect(last(c).status).toBe("done");
  });

  it("drops a failed question from the model's history, and keeps the conversation going", async () => {
    let fail = true;
    const c = new Conversation<string>({
      send: async (_m, _t, onText) => {
        if (fail) throw new Error("down");
        onText("Hi.");
        return { role: "assistant", content: "Hi." };
      },
      kit,
      system: () => "sys",
    });
    expect(await c.ask({ text: "One" })).toBe("failed");
    expect(last(c).status).toBe("failed");
    expect(c.messages.map((m) => m.role)).toEqual(["system"]);
    fail = false;
    await c.ask({ text: "Two" });
    expect(c.messages.map((m) => m.content)).toEqual(["sys", "Two", "Hi."]);
    expect(c.entries).toHaveLength(4);
  });

  it("stops, and starts over", async () => {
    const c = new Conversation<string>({
      send: (_m, _t, _o, signal) =>
        new Promise((_, reject) =>
          signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
      kit,
      system: () => "",
    });
    const asked = c.ask({ text: "Long one" });
    expect(c.working).toBe(true);
    await expect(c.ask({ text: "Another" })).rejects.toThrow();
    c.stop();
    expect(await asked).toBe("cancelled");
    expect(last(c).status).toBe("stopped");
    c.reset();
    expect(c.entries).toEqual([]);
    expect(c.messages).toEqual([]);
  });

  it("changes a card in place", async () => {
    const c = new Conversation<string>({
      send: model([toolCall("search")]),
      kit,
      system: () => "",
    });
    await c.ask({ text: "Find" });
    c.update("papers", "papers (saved)");
    expect(last(c).attachments).toEqual(["papers (saved)"]);
  });
});
