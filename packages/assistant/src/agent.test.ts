import { describe, expect, it } from "vitest";
import { MAX_RESULT, MAX_STEPS, runAgent, type Step } from "./agent";
import { toolkit, type Tool } from "./tools";
import type { AssistantReply, ChatMessage, SendTurn } from "./types";

function call(id: string, name: string, args: object | string): AssistantReply {
  return {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id,
        type: "function",
        function: {
          name,
          arguments: typeof args === "string" ? args : JSON.stringify(args),
        },
      },
    ],
  };
}

/** A model that answers from a script, keeping what it was sent. */
function scripted(replies: AssistantReply[]) {
  const seen: ChatMessage[][] = [];
  const send: SendTurn = async (messages, _tools, onText) => {
    seen.push([...messages]);
    const reply = replies.shift() ?? { role: "assistant", content: "Done." };
    if (reply.content) onText(reply.content);
    return reply;
  };
  return { send, seen };
}

const readFile: Tool<string> = {
  name: "read_file",
  description: "Read a file.",
  parameters: { type: "object", properties: { path: { type: "string" } } },
  kind: "read",
  run: async (args) =>
    args.path === "main.tex" ? "1| Hi" : Promise.reject(new Error("No such file.")),
  describe: (args) => `Read ${String(args.path)}`,
};
const propose: Tool<string> = {
  name: "propose_change",
  description: "Propose a change.",
  parameters: { type: "object" },
  kind: "propose",
  run: async () => ({ result: "Shown to the user as change 1.", attachment: "card 1" }),
  describe: () => "Proposed a change",
};
const kit = toolkit([readFile, propose]);
const history = (): ChatMessage[] => [
  { role: "system", content: "You are the assistant." },
  { role: "user", content: "Check my file." },
];

describe("runAgent", () => {
  it("runs tool calls until the model answers in text", async () => {
    const { send, seen } = scripted([
      call("c1", "read_file", { path: "main.tex" }),
      { role: "assistant", content: "Your document looks fine." },
    ]);
    const h = history();
    const steps: Step[] = [];
    const outcome = await runAgent(h, kit, send, {
      onText: () => {},
      onStep: (s) => steps.push(s),
    });
    expect(outcome).toBe("done");
    expect(steps).toEqual([{ tool: "read_file", label: "Read main.tex", ok: true }]);
    expect(h.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(h[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "1| Hi" });
    expect(seen[1]).toHaveLength(4);
  });

  it("hands the panel what a propose tool made", async () => {
    const { send } = scripted([call("c1", "propose_change", {})]);
    const cards: string[] = [];
    await runAgent(history(), kit, send, {
      onText: () => {},
      onStep: () => {},
      onAttachment: (a) => cards.push(a),
    });
    expect(cards).toEqual(["card 1"]);
  });

  it("tells the model about bad calls instead of failing", async () => {
    const { send } = scripted([
      call("c1", "read_file", "{not json"),
      call("c2", "delete_everything", {}),
      call("c3", "read_file", { path: "gone.tex" }),
    ]);
    const h = history();
    const steps: Step[] = [];
    await runAgent(h, kit, send, { onText: () => {}, onStep: (s) => steps.push(s) });
    const answers = h.filter((m) => m.role === "tool").map((m) => m.content);
    expect(answers).toEqual([
      "Error: the arguments were not a JSON object.",
      "Error: there is no tool named delete_everything.",
      "Error: No such file.",
    ]);
    expect(steps).toEqual([{ tool: "read_file", label: "Read gone.tex", ok: false }]);
  });

  it("cuts long results", async () => {
    const big = toolkit([
      { ...readFile, run: async () => "x".repeat(MAX_RESULT + 50) },
    ]);
    const { send } = scripted([call("c1", "read_file", { path: "main.tex" })]);
    const h = history();
    await runAgent(h, big, send, { onText: () => {}, onStep: () => {} });
    const tool = h.find((m) => m.role === "tool");
    expect(tool?.content).toContain("(cut: 50 more characters)");
  });

  it("stops after MAX_STEPS turns", async () => {
    const send: SendTurn = async () => call("c", "read_file", { path: "main.tex" });
    expect(
      await runAgent(history(), kit, send, { onText: () => {}, onStep: () => {} }),
    ).toBe("limit");
    let turns = 0;
    await runAgent(
      history(),
      kit,
      async () => (turns++, call("c", "read_file", { path: "main.tex" })),
      {
        onText: () => {},
        onStep: () => {},
      },
    );
    expect(turns).toBe(MAX_STEPS);
  });

  it("answers every call once stopped, so the history stays valid", async () => {
    const controller = new AbortController();
    const two: AssistantReply = {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "a",
          type: "function",
          function: { name: "read_file", arguments: '{"path":"main.tex"}' },
        },
        {
          id: "b",
          type: "function",
          function: { name: "read_file", arguments: '{"path":"main.tex"}' },
        },
      ],
    };
    const h = history();
    const outcome = await runAgent(h, kit, async () => two, {
      onText: () => {},
      onStep: () => controller.abort(),
      signal: controller.signal,
    });
    expect(outcome).toBe("cancelled");
    expect(h.filter((m) => m.role === "tool").map((m) => m.content)).toEqual([
      "1| Hi",
      "Stopped by the user.",
    ]);
  });

  it("passes the model's errors on, but not once stopped", async () => {
    const failing: SendTurn = async () => {
      throw new Error("model down");
    };
    await expect(
      runAgent(history(), kit, failing, { onText: () => {}, onStep: () => {} }),
    ).rejects.toThrow("model down");
    const controller = new AbortController();
    const aborting: SendTurn = async () => {
      controller.abort();
      throw new Error("aborted");
    };
    expect(
      await runAgent(history(), kit, aborting, {
        onText: () => {},
        onStep: () => {},
        signal: controller.signal,
      }),
    ).toBe("cancelled");
  });
});

describe("toolkit", () => {
  it("gives the model the tools in the OpenAI shape", () => {
    expect(kit.specs[0]).toEqual({
      type: "function",
      function: {
        name: "read_file",
        description: "Read a file.",
        parameters: readFile.parameters,
      },
    });
    expect(kit.get("propose_change")?.kind).toBe("propose");
  });

  it("refuses names the APIs don't take, and twins", () => {
    expect(() => toolkit([{ ...readFile, name: "read file" }])).toThrow();
    expect(() => toolkit([readFile, readFile])).toThrow();
  });
});
