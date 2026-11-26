// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { errorFromServer } from "@scholarkit/assistant";
import type { AgentMessage } from "@/lib/tauri";

const disk: Record<string, string> = {};
/** The model's replies, in order; each sees the history so far. */
let script: ((
  messages: AgentMessage[],
) => Extract<AgentMessage, { role: "assistant" }>)[] = [];
const compiled = vi.fn(async () => {});

async function answer(messages: AgentMessage[], onText: (delta: string) => void) {
  const next = script.shift();
  const reply = next
    ? next(messages)
    : { role: "assistant" as const, content: "Done." };
  if (reply.content) onText(reply.content);
  return reply;
}

vi.mock("@/lib/query-client", () => ({ invalidateGitState: vi.fn(async () => {}) }));
vi.mock("@/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tauri")>()),
  readProjectFile: vi.fn(async (_dir: string, path: string) => {
    if (disk[path] === undefined) throw new Error("not found");
    return disk[path];
  }),
  writeProjectFile: vi.fn(async (_dir: string, path: string, content: string) => {
    disk[path] = content;
  }),
  setAssistantCompile: vi.fn(async (projectPath: string, allowed: boolean) => ({
    assistantCompileProjects: allowed ? [projectPath] : [],
  })),
  updatePreferences: vi.fn(async () => ({})),
  accountUsage: vi.fn(async () => ({
    plan: "plus",
    storage: { usedBytes: 0, limitBytes: 1 },
    compile: { usedPercent: 0, resetsAt: "2026-11-27T00:00:00.000Z" },
    reviewLinks: { count: 0, limit: null },
    assistant: { usedPercent: 12, resetsAt: "2026-12-01T00:00:00.000Z" },
  })),
  aiAgentTurn: vi.fn(
    async (args: { messages: AgentMessage[] }, onText: (delta: string) => void) =>
      answer(args.messages, onText),
  ),
  assistantTurn: vi.fn(
    async (args: { messages: AgentMessage[] }, onText: (delta: string) => void) => {
      if (script.length === 0) throw errorFromServer("assistant_used_up", "Used up.");
      return answer(args.messages, onText);
    },
  ),
}));

import {
  AskAssistantButton,
  AssistantDock,
  AssistantFloatingLayer,
} from "@/components/Assistant";
import { useAssistantStore } from "@/store/assistant";
import { useEditorStore } from "@/store/editor";
import { usePreviewStore } from "@/store/preview";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";

const file = (path: string) => ({
  name: path,
  path,
  isDir: false,
  size: null,
  modified: null,
  children: [],
});

const call = (name: string, args: object) => () => ({
  role: "assistant" as const,
  content: "",
  tool_calls: [
    {
      id: `call-${name}`,
      type: "function" as const,
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});

let root: Root | null = null;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

async function render(node: React.ReactNode = <AssistantDock />) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(node);
  });
  return host;
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

beforeEach(() => {
  for (const key of Object.keys(disk)) delete disk[key];
  disk["main.tex"] = "\\begin{document}\nHello.\n\\end{document}";
  disk["table.tex"] = "\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}";
  script = [];
  compiled.mockClear();
  useProjectStore.setState({
    project: { name: "p", path: "/p" },
    files: [file("main.tex"), file("table.tex")],
    mainFile: "main.tex",
    activeFile: "main.tex",
    buffers: {},
  });
  useEditorStore.setState({ content: disk["main.tex"] });
  useSettingsStore.setState({
    ai: {
      provider: null,
      baseUrl: "http://localhost:11434/v1",
      apiKey: "k",
      model: "m",
    },
    assistantSource: null,
    assistantLayout: "floating",
    assistantMode: "latex",
    assistantCompileProjects: [],
  });
  useAssistantStore.getState().syncProject(null);
  useAssistantStore.getState().syncProject("/p");
  useAssistantStore.setState({ barOpen: false, sheetOpen: false, usage: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("the docked assistant", () => {
  it("shows a proposed change and applies it to the file", async () => {
    script = [
      call("read_file", { path: "table.tex" }),
      call("propose_change", {
        path: "table.tex",
        explanation: "Right-aligns the second column.",
        replacements: [{ find: "{ll}", replace: "{lr}" }],
      }),
      () => ({ role: "assistant", content: "Review the change below." }),
    ];
    const host = await render();
    await act(async () => {
      await useAssistantStore.getState().ask("Align the numbers right.");
    });
    await settle();
    expect(host.textContent).toContain("2 steps");
    expect(host.textContent).toContain("Review the change below.");
    expect(host.textContent).toContain("\\begin{tabular}{lr}");
    expect(disk["table.tex"]).toContain("{ll}");

    await act(async () => {
      button(host, "Apply").click();
    });
    await settle();
    expect(disk["table.tex"]).toContain("{lr}");
    expect(host.textContent).toContain("Applied.");

    // The model hears about it, and about the new mode, with the next question.
    await act(async () => {
      await useSettingsStore.getState().setAssistantMode("writing");
    });
    script = [
      (messages) => {
        const last = messages[messages.length - 1];
        return {
          role: "assistant",
          content:
            last.content.startsWith("The user applied change 1.") &&
            last.content.includes("switched the assistant to Writing mode")
              ? "Noted."
              : "?",
        };
      },
    ];
    await act(async () => {
      await useAssistantStore.getState().ask("Thanks.");
    });
    expect(host.textContent).toContain("Noted.");
  });

  it("warns when a change in LaTeX mode edits the text", async () => {
    script = [
      call("propose_change", {
        path: "main.tex",
        explanation: "Rewords the greeting.",
        replacements: [{ find: "Hello.", replace: "Goodbye." }],
      }),
    ];
    const host = await render();
    await act(async () => {
      await useAssistantStore.getState().ask("Fix it.");
    });
    await settle();
    expect(host.textContent).toContain("This change edits your text");
  });

  it("asks before it compiles, and remembers the answer", async () => {
    usePreviewStore.setState({
      compileNow: async () => {
        await compiled();
        usePreviewStore.setState({ status: "ok", issues: [], error: null });
      },
    });
    script = [
      call("compile", {}),
      () => ({ role: "assistant", content: "It compiles." }),
    ];
    const host = await render();
    let asking: Promise<void> = Promise.resolve();
    await act(async () => {
      asking = useAssistantStore.getState().ask("Does it compile?");
    });
    await settle();
    expect(host.textContent).toContain("Allow the assistant to compile this project?");
    expect(compiled).not.toHaveBeenCalled();
    await act(async () => {
      button(host, "Allow compiling").click();
      await asking;
    });
    expect(compiled).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().assistantCompileProjects).toEqual(["/p"]);
    expect(host.textContent).toContain("It compiles.");
  });

  it("asks for a provider when the own one isn't set up", async () => {
    useSettingsStore.setState({ ai: null, assistantSource: "own" });
    const host = await render();
    expect(host.textContent).toContain(
      "Set up an AI provider in the assistant settings to ask.",
    );
  });

  it("shows the month used on our model, and says when it is used up", async () => {
    useSettingsStore.setState({ assistantSource: "scholarkit" });
    const host = await render();
    await settle();
    expect(host.textContent).toContain("12% used this month");
    await act(async () => {
      await useAssistantStore.getState().ask("Why?");
    });
    expect(host.textContent).toContain("You've used all of this month's assistant");
  });
});

describe("the floating assistant", () => {
  it("opens from the Ask button and answers above the bar", async () => {
    script = [() => ({ role: "assistant", content: "Use booktabs." })];
    const host = await render(
      <>
        <AskAssistantButton />
        <AssistantFloatingLayer />
      </>,
    );
    expect(host.querySelector("textarea")).toBeNull();
    await act(async () => {
      button(host, "Ask").click();
    });
    expect(host.querySelector("textarea")).not.toBeNull();
    await act(async () => {
      await useAssistantStore.getState().ask("Nicer tables?");
    });
    expect(host.textContent).toContain("Nicer tables?");
    expect(host.textContent).toContain("Use booktabs.");
    await act(async () => {
      button(host, "Ask").click();
    });
    expect(host.querySelector("textarea")).toBeNull();
  });
});
