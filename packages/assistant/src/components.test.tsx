// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiffCard, PaperCard } from "./cards";
import { AskBar, AssistantFloating } from "./Floating";
import { Composer } from "./Composer";
import type { Entry } from "./conversation";
import { lineDiff } from "./diff";
import { AssistantPanel } from "./Panel";
import { AskButton, ConversationView, UsageLine } from "./parts";
import { SelectionMenu } from "./SelectionMenu";
import { AssistantError } from "./transport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
});

function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

const button = (label: string) =>
  [...host!.querySelectorAll("button")].find(
    (b) =>
      b.textContent === label ||
      b.title === label ||
      b.getAttribute("aria-label") === label,
  )!;

function press(el: Element, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

describe("Composer", () => {
  function Harness({ onSend }: { onSend: (text: string) => void }) {
    const [value, setValue] = useState("Fix this error.");
    return (
      <Composer
        value={value}
        onChange={setValue}
        onSend={() => onSend(value)}
        onStop={() => {}}
        working={false}
        placeholder="Ask about your project"
        chips={[{ id: "f", label: "chapter3.tex", icon: "file-text" }]}
        onRemoveChip={() => {}}
        model="Scholarkit AI"
      />
    );
  }

  it("sends on Enter, not on Shift+Enter", () => {
    const onSend = vi.fn();
    render(<Harness onSend={onSend} />);
    const input = host!.querySelector("textarea")!;
    press(input, "Enter", { shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    press(input, "Enter");
    expect(onSend).toHaveBeenCalledWith("Fix this error.");
    expect(host!.textContent).toContain("chapter3.tex");
    expect(button("Remove chapter3.tex")).toBeTruthy();
  });

  it("offers Stop while the assistant works, and no Send for an empty question", () => {
    const onStop = vi.fn();
    render(
      <Composer
        value=""
        onChange={() => {}}
        onSend={() => {}}
        onStop={onStop}
        working
        placeholder="Ask"
      />,
    );
    act(() => button("Stop").click());
    expect(onStop).toHaveBeenCalled();
    act(() =>
      root!.render(
        <Composer
          value=" "
          onChange={() => {}}
          onSend={() => {}}
          onStop={() => {}}
          working={false}
          placeholder="Ask"
        />,
      ),
    );
    expect(button("Send").disabled).toBe(true);
  });
});

describe("ConversationView", () => {
  const entries: Entry<string>[] = [
    {
      kind: "user",
      id: 1,
      text: "Fix this error.",
      chips: [{ id: "e", label: "Undefined control sequence", tone: "error" }],
    },
    {
      kind: "assistant",
      id: 2,
      text: "`\\toprule` comes from `booktabs`.",
      steps: [
        { tool: "read_file", label: "Read chapter3.tex", ok: true },
        { tool: "package_info", label: "Looked up booktabs", ok: true },
      ],
      current: null,
      attachments: ["diff"],
      status: "done",
      error: null,
    },
    {
      kind: "assistant",
      id: 3,
      text: "",
      steps: [],
      current: null,
      attachments: [],
      status: "failed",
      error: new AssistantError("used_up", "x"),
    },
  ];

  it("folds the steps into one line that opens", () => {
    render(
      <ConversationView entries={entries} renderAttachment={(a) => <b>card {a}</b>} />,
    );
    expect(host!.textContent).toContain("2 steps");
    expect(host!.textContent).not.toContain("Read chapter3.tex");
    act(() => button("2 steps").click());
    expect(host!.textContent).toContain("Read chapter3.tex");
    expect(host!.querySelector("code")?.textContent).toBe("\\toprule");
    expect(host!.textContent).toContain("card diff");
    expect(host!.querySelector("[role=alert]")?.textContent).toContain(
      "this month's assistant",
    );
  });

  it("shows the step running now while working", () => {
    render(
      <ConversationView
        entries={[
          {
            ...(entries[1] as Extract<Entry<string>, { kind: "assistant" }>),
            status: "working",
            current: "Compiling…",
          },
        ]}
      />,
    );
    expect(host!.textContent).toContain("Read chapter3.tex");
    expect(host!.textContent).toContain("Compiling…");
  });
});

describe("the panel", () => {
  it("has the header buttons and the modes", () => {
    const onMode = vi.fn();
    const onClose = vi.fn();
    render(
      <AssistantPanel
        onClose={onClose}
        onNew={() => {}}
        composer={<div />}
        footer={
          <UsageLine source={{ kind: "ours", plan: "plus", usedPercent: 34.4 }} />
        }
        modes={{
          options: [
            { id: "latex", label: "LaTeX" },
            { id: "writing", label: "Writing" },
          ],
          value: "latex",
          onChange: onMode,
          hint: "Fixes LaTeX, leaves your text alone",
        }}
      >
        <p>Conversation</p>
      </AssistantPanel>,
    );
    act(() => button("Writing").click());
    expect(onMode).toHaveBeenCalledWith("writing");
    act(() => button("Close").click());
    expect(onClose).toHaveBeenCalled();
    expect(host!.textContent).toContain("34% used this month");
    expect(host!.textContent).toContain("Not used for training");
  });

  it("says whose key or model answers", () => {
    render(<UsageLine source={{ kind: "local", model: "Qwen 3 8B" }} />);
    expect(host!.textContent).toContain("Qwen 3 8B on this computer");
    expect(host!.textContent).toContain("Stays on this computer");
  });

  it("marks the Ask button when the panel is open", () => {
    render(<AskButton on onClick={() => {}} />);
    expect(host!.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
    expect(host!.textContent).toContain("Ask");
  });
});

describe("cards", () => {
  it("applies or discards a change, then says which", () => {
    const onApply = vi.fn();
    const diff = lineDiff("a\nb\n", "a\nX\nb\n");
    render(
      <DiffCard
        file="main.tex"
        diff={diff}
        state="open"
        applyLabel="Apply and compile"
        onApply={onApply}
        onDiscard={() => {}}
      />,
    );
    expect(host!.textContent).toContain("+1");
    act(() => button("Apply and compile").click());
    expect(onApply).toHaveBeenCalled();
    act(() =>
      root!.render(
        <DiffCard
          file="main.tex"
          diff={diff}
          state="applied"
          onApply={() => {}}
          onDiscard={() => {}}
        />,
      ),
    );
    expect(host!.textContent).toContain("Applied.");
    expect(host!.textContent).not.toContain("Discard");
  });

  it("shows a paper with its passage and actions", () => {
    const onCite = vi.fn();
    render(
      <PaperCard
        title="Green roofs and the urban heat island: a review"
        meta="Santamouris · Solar Energy · 2014"
        freePdf
        quote="…between 25 and 30 degrees cooler…"
        actions={[{ label: "Cite", primary: true, onClick: onCite }]}
      />,
    );
    expect(host!.textContent).toContain("Free PDF");
    act(() => button("Cite").click());
    expect(onCite).toHaveBeenCalled();
  });
});

describe("SelectionMenu", () => {
  const groups = [
    {
      label: "Selection",
      items: [
        {
          id: "source",
          label: "Find a source for this",
          hint: "Searches 250 million works",
        },
        { id: "shorter", label: "Make it shorter" },
      ],
    },
    { label: "This note", items: [{ id: "citations", label: "Check every citation" }] },
  ];

  it("moves with the arrows and runs the action on Enter", () => {
    const onPick = vi.fn();
    render(
      <SelectionMenu
        groups={groups}
        placeholder="Ask about the selection…"
        onPick={onPick}
        onAsk={() => {}}
        onClose={() => {}}
      />,
    );
    const input = host!.querySelector("input")!;
    press(input, "ArrowDown");
    press(input, "ArrowDown");
    press(input, "Enter");
    expect(onPick).toHaveBeenCalledWith("citations");
  });

  it("filters as the person types, and asks their own question when nothing matches", () => {
    const onAsk = vi.fn();
    const onClose = vi.fn();
    render(
      <SelectionMenu
        groups={groups}
        placeholder="Ask"
        onPick={() => {}}
        onAsk={onAsk}
        onClose={onClose}
      />,
    );
    const input = host!.querySelector("input")!;
    const type = (text: string) =>
      act(() => {
        const set = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!;
        set.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    type("short");
    expect(host!.querySelectorAll("[role=option]")).toHaveLength(1);
    type("Is this claim too strong?");
    press(input, "Enter");
    expect(onAsk).toHaveBeenCalledWith("Is this claim too strong?");
    press(input, "Escape");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the floating layout", () => {
  const entries: Entry<string>[] = [
    { kind: "user", id: 1, text: "First question", chips: [] },
    {
      kind: "assistant",
      id: 2,
      text: "First answer.",
      steps: [],
      current: null,
      attachments: [],
      status: "done",
      error: null,
    },
    {
      kind: "user",
      id: 3,
      text: "What does this source say about street level?",
      chips: [],
    },
    {
      kind: "assistant",
      id: 4,
      text: "Much less than on the roof.",
      steps: [{ tool: "read", label: "Read page 12", ok: true }],
      current: null,
      attachments: ["card"],
      status: "done",
      error: null,
    },
  ];

  it("shows the latest answer above the bar, with its steps open", () => {
    const onDock = vi.fn();
    const onClose = vi.fn();
    render(
      <AssistantFloating
        entries={entries}
        open
        onClose={onClose}
        onDock={onDock}
        renderAttachment={(a) => <b>{a}</b>}
        bar={
          <AskBar
            value=""
            onChange={() => {}}
            onSend={() => {}}
            onStop={() => {}}
            working={false}
            placeholder="Ask"
          />
        }
      />,
    );
    expect(host!.textContent).toContain(
      "What does this source say about street level?",
    );
    expect(host!.textContent).toContain("Much less than on the roof.");
    expect(host!.textContent).not.toContain("First answer.");
    expect(host!.textContent).toContain("Read page 12");
    expect(host!.textContent).toContain("card");
    act(() => button("Earlier questions").click());
    act(() => button("Open in the side panel").click());
    expect(onDock).toHaveBeenCalledTimes(2);
    press(host!.querySelector("textarea")!, "Escape");
    expect(onClose).toHaveBeenCalled();
  });

  it("leaves only the bar when closed", () => {
    render(
      <AssistantFloating
        entries={entries}
        open={false}
        onClose={() => {}}
        onDock={() => {}}
        bar={
          <AskBar
            value=""
            onChange={() => {}}
            onSend={() => {}}
            onStop={() => {}}
            working={false}
            placeholder="Ask"
          />
        }
      />,
    );
    expect(host!.querySelector(".assistant-sheet")).toBeNull();
    expect(host!.querySelector(".assistant-bar")).not.toBeNull();
  });

  it("sends from the bar on Enter, and marks it while working", () => {
    const onSend = vi.fn();
    render(
      <AskBar
        value="Fix this error."
        onChange={() => {}}
        onSend={onSend}
        onStop={() => {}}
        working={false}
        placeholder="Ask"
      />,
    );
    press(host!.querySelector("textarea")!, "Enter");
    expect(onSend).toHaveBeenCalled();
    act(() =>
      root!.render(
        <AskBar
          value=""
          onChange={() => {}}
          onSend={() => {}}
          onStop={() => {}}
          working
          placeholder="Ask"
        />,
      ),
    );
    expect(host!.querySelector(".assistant-bar")?.hasAttribute("data-working")).toBe(
      true,
    );
    expect(button("Stop")).toBeTruthy();
  });

  it("offers the floating layout from the panel", () => {
    const onFloat = vi.fn();
    render(
      <AssistantPanel
        onClose={() => {}}
        onNew={() => {}}
        onFloat={onFloat}
        composer={<div />}
      >
        <p />
      </AssistantPanel>,
    );
    act(() => button("Float over the page").click());
    expect(onFloat).toHaveBeenCalled();
  });
});
