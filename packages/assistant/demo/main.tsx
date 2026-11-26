import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AnswerActions,
  AskBar,
  AskButton,
  AssistantFloating,
  AssistantPanel,
  Composer,
  ConversationView,
  DiffCard,
  lineDiff,
  PaperCard,
  SelectionMenu,
  SourceQuote,
  Suggestions,
  UsageLine,
  type ContextChipData,
  type Entry,
} from "../src";
import "../src/assistant.css";
import "./demo.css";

const params = new URLSearchParams(location.search);
const app = (params.get("app") ?? "polemic") as "polemic" | "cursive" | "binder";
const view = params.get("view") ?? "panel";
document.documentElement.classList.add(app);
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");

const PREAMBLE_BEFORE =
  "\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n";
const PREAMBLE_AFTER = PREAMBLE_BEFORE.replace(
  "\\usepackage{hyperref}",
  "\\usepackage{booktabs}\n\\usepackage{hyperref}",
);

type Card = "diff" | "papers" | "quotes";

const done = (
  id: number,
  text: string,
  labels: string[],
  attachments: Card[],
): Entry<Card> => ({
  kind: "assistant",
  id,
  text,
  steps: labels.map((label) => ({ tool: "t", label, ok: true })),
  current: null,
  attachments,
  status: "done",
  error: null,
});

const SAMPLES: Record<
  typeof app,
  {
    entries: Entry<Card>[];
    chips: ContextChipData[];
    placeholder: string;
    suggestions: string[];
  }
> = {
  polemic: {
    entries: [
      {
        kind: "user",
        id: 1,
        text: "Fix this error.",
        chips: [
          {
            id: "e",
            label: "Undefined control sequence · line 44",
            icon: "circle-x",
            tone: "error",
          },
        ],
      },
      done(
        2,
        "`\\toprule`, `\\midrule` and `\\bottomrule` come from the `booktabs` package, and your preamble doesn't load it. Adding it to `main.tex` fixes all three.",
        [
          "Checked 1 issue",
          "Read chapter3.tex, lines 30 to 60",
          "Read main.tex",
          "Looked up booktabs",
        ],
        ["diff"],
      ),
    ],
    chips: [
      { id: "f", label: "chapter3.tex", icon: "file-text" },
      { id: "s", label: "Lines 41–55", icon: "text-select" },
    ],
    placeholder: "Ask about your project, or type / for actions",
    suggestions: ["Make this table fit the page", "Fix all warnings"],
  },
  cursive: {
    entries: [
      {
        kind: "user",
        id: 1,
        text: "Find a source for this claim.",
        chips: [
          {
            id: "s",
            label: "“Several studies report that a vegetated…”",
            icon: "text-select",
          },
        ],
      },
      done(
        2,
        "Two reviews back the 30 °C figure directly. The third is a field study with a lower number (25 °C), which you may want to cite for balance.",
        ["Searched 250 million works", "Read 6 abstracts"],
        ["papers"],
      ),
    ],
    chips: [{ id: "n", label: "Related work", icon: "file-text" }],
    placeholder: "Ask about your notes, or type / for actions",
    suggestions: [],
  },
  binder: {
    entries: [
      {
        kind: "user",
        id: 1,
        text: "What do my sources say about cooling on hot days?",
        chips: [{ id: "l", label: "Reading list · 12 sources", icon: "file-text" }],
      },
      done(
        2,
        "They agree that the roof surface cools a lot: 25 to 30 °C on days above 35 °C [1] [2]. The air at street level cools far less, under 1 °C [1].\n\nTwo sources say the effect fades in dry spells unless the roof is watered [1] [3]. None of your sources measure indoor temperature.",
        ["Read 12 sources", "Checked 5 quotes"],
        ["quotes"],
      ),
    ],
    chips: [{ id: "l", label: "Reading list", icon: "file-text" }],
    placeholder: "Ask your sources, or type / for actions",
    suggestions: [],
  },
};

function Attachment({ card }: { card: Card }) {
  const [state, setState] = useState<"open" | "applied" | "discarded">("open");
  if (card === "diff")
    return (
      <DiffCard
        file="main.tex"
        diff={lineDiff(PREAMBLE_BEFORE, PREAMBLE_AFTER, 2)}
        where="Line 5"
        note="You can undo this from snapshots."
        state={state}
        applyLabel="Apply and compile"
        onApply={() => setState("applied")}
        onDiscard={() => setState("discarded")}
      />
    );
  if (card === "papers")
    return (
      <div className="stack">
        <PaperCard
          best
          title="Green roofs and the urban heat island: a review"
          meta="Santamouris · Solar Energy · 2014"
          freePdf
          quote="“…between 25 and 30 degrees cooler than a conventional roof…”"
          actions={[
            { label: "Cite", icon: "quote", primary: true, onClick: () => {} },
            { label: "Save to Binder", icon: "bookmark-plus", onClick: () => {} },
          ]}
        />
        <PaperCard
          title="Urban heat island mitigation with green roofs"
          meta="Bevilacqua et al. · Building and Environment · 2016"
          freePdf
          quote="“…a peak reduction of 30 °C on the roof surface…”"
          actions={[
            { label: "Cite", icon: "quote", onClick: () => {} },
            { label: "Save to Binder", icon: "bookmark-plus", onClick: () => {} },
          ]}
        />
      </div>
    );
  return (
    <div className="stack" style={{ gap: 10 }}>
      <SourceQuote
        n={1}
        source="Santamouris · 2014 · p. 12"
        found
        quote="On days above 35 °C, the surface of an extensive green roof stayed between 25 and 30 degrees cooler…"
      />
      <SourceQuote
        n={2}
        source="Sailor et al. · 2012 · p. 4"
        found
        quote="Peak surface temperature was up to 25 °C lower on clear summer afternoons."
      />
      <SourceQuote
        n={3}
        source="Van Mechelen et al. · 2015 · p. 7"
        found
        quote="Evapotranspiration fell by 60 percent after nine days without rain."
      />
      <AnswerActions
        actions={[
          { label: "Save as note", icon: "notebook-pen", onClick: () => {} },
          { label: "Copy", icon: "copy", onClick: () => {} },
        ]}
      />
    </div>
  );
}

function Panel() {
  const sample = SAMPLES[app];
  const [mode, setMode] = useState("latex");
  const [chips, setChips] = useState(sample.chips);
  const [text, setText] = useState("");
  return (
    <AssistantPanel
      onClose={() => {}}
      onNew={() => {}}
      onHistory={() => {}}
      onFloat={() => {}}
      modes={
        app === "polemic"
          ? {
              options: [
                { id: "latex", label: "LaTeX" },
                { id: "writing", label: "Writing" },
              ],
              value: mode,
              onChange: setMode,
              hint:
                mode === "latex"
                  ? "Fixes LaTeX, leaves your text alone"
                  : "Polishes your text, leaves LaTeX alone",
            }
          : undefined
      }
      composer={
        <Composer
          value={text}
          onChange={setText}
          onSend={() => setText("")}
          onStop={() => {}}
          working={false}
          placeholder={sample.placeholder}
          chips={chips}
          onRemoveChip={(id) => setChips(chips.filter((c) => c.id !== id))}
          onAttach={() => {}}
          onMention={() => {}}
          onActions={() => {}}
          model="Scholarkit AI"
          onPickModel={() => {}}
        />
      }
      footer={<UsageLine source={{ kind: "ours", plan: "plus", usedPercent: 34 }} />}
    >
      <ConversationView
        entries={sample.entries}
        renderAttachment={(card) => <Attachment card={card} />}
        onCite={app === "binder" ? () => {} : undefined}
      />
      <div style={{ padding: "0 16px 8px" }}>
        <Suggestions
          items={sample.suggestions.map((label, i) => ({
            label,
            icon: i ? "triangle-alert" : "file-text",
            onPick: () => {},
          }))}
        />
      </div>
    </AssistantPanel>
  );
}

function Menu() {
  return (
    <SelectionMenu
      placeholder="Ask about the selection…"
      groups={[
        {
          label: "Selection",
          items: [
            {
              id: "source",
              label: "Find a source for this",
              icon: "quote",
              hint: "Searches 250 million works",
            },
            { id: "shorter", label: "Make it shorter", icon: "text-select" },
            { id: "clearer", label: "Make it clearer", icon: "square-pen" },
          ],
        },
        {
          label: "This note",
          items: [
            {
              id: "citations",
              label: "Check every citation",
              icon: "circle-check",
            },
            {
              id: "outline",
              label: "Outline from my reading notes",
              icon: "notebook-pen",
            },
          ],
        },
      ]}
      onPick={() => {}}
      onAsk={() => {}}
      onClose={() => {}}
    />
  );
}

function Frame({ children, side }: { children: ReactNode; side?: ReactNode }) {
  const name = { polemic: "Polemic", cursive: "Cursive", binder: "Binder" }[app];
  return (
    <div className="frame">
      <div className="app">
        <div className="top">
          <b>{name}</b>
          <span className="grow" />
          <AskButton on={Boolean(side)} onClick={() => {}} />
          <span className="avatar">SR</span>
        </div>
        <div className="work">{children}</div>
      </div>
      {side && <div className="side">{side}</div>}
    </div>
  );
}

const FLOATING: Record<
  typeof app,
  { entries: Entry<Card>[]; placeholder: string; value: string }
> = {
  polemic: {
    entries: [
      SAMPLES.polemic.entries[0],
      {
        kind: "assistant",
        id: 2,
        text: "The table uses `\\toprule` from `booktabs`, which your preamble didn't load. I'm adding it to `main.tex` and compiling to check.",
        steps: [
          { tool: "t", label: "Read chapter3.tex, line 44", ok: true },
          { tool: "t", label: "Looked up \\toprule: from booktabs", ok: true },
          { tool: "t", label: "Added it to main.tex, line 5", ok: true },
        ],
        current: "Compiling to check…",
        attachments: [],
        status: "working",
        error: null,
      },
    ],
    placeholder: "Ask about your project, or type / for actions",
    value: "",
  },
  cursive: {
    entries: [],
    placeholder: "Ask about this note, or select text first",
    value: "",
  },
  binder: {
    entries: [
      {
        kind: "user",
        id: 1,
        text: "What does this source say about street level?",
        chips: [],
      },
      {
        kind: "assistant",
        id: 2,
        text: "Much less than on the roof. Greening every roof in a city block lowers the air at street level by only 0.3 to 0.8 °C [1], against 25 to 30 °C on the roof surface [2]. The effect also fades within a week without water [3].",
        steps: [
          { tool: "t", label: "Read pages 10 to 14", ok: true },
          { tool: "t", label: "Checked 3 quotes", ok: true },
        ],
        current: null,
        attachments: [],
        status: "done",
        error: null,
      },
    ],
    placeholder: "Ask this source, or all your sources",
    value: "",
  },
};

function Floating() {
  const sample = FLOATING[app];
  const [open, setOpen] = useState(true);
  const [text, setText] = useState(sample.value);
  const working = sample.entries.some(
    (e) => e.kind === "assistant" && e.status === "working",
  );
  return (
    <AssistantFloating
      entries={sample.entries}
      open={open}
      onClose={() => setOpen(false)}
      onDock={() => {}}
      onCite={app === "binder" ? () => {} : undefined}
      bar={
        <AskBar
          value={text}
          onChange={setText}
          onSend={() => setText("")}
          onStop={() => {}}
          working={working}
          placeholder={sample.placeholder}
          model="Scholarkit AI"
          onPickModel={() => {}}
        />
      }
    />
  );
}

function Page() {
  if (view === "floating")
    return (
      <Frame>
        {app === "cursive" ? (
          <>
            <p>
              Green roofs are one of the few measures a city can take on existing
              buildings.{" "}
              <span className="sel">
                Several studies report that a vegetated roof lowers the surface
                temperature on hot days by up to 30 °C
              </span>
              , though the effect on the air at street level is much smaller.
            </p>
            <div className="bar" style={{ width: "86%" }} />
            <div className="bar" style={{ width: "72%" }} />
            <div className="menu-at">
              <Menu />
            </div>
          </>
        ) : (
          [92, 80, 86, 64, 0, 90, 76, 84, 58, 0, 88, 70, 82].map((w, i) => (
            <div
              key={i}
              className="bar"
              style={{ width: `${w}%`, visibility: w ? "visible" : "hidden" }}
            />
          ))
        )}
        <Floating />
      </Frame>
    );
  if (view === "menu")
    return (
      <Frame>
        <p>
          Green roofs are one of the few measures a city can take on existing buildings.{" "}
          <span className="sel">
            Several studies report that a vegetated roof lowers the surface temperature
            on hot days by up to 30 °C
          </span>
          , though the effect on the air at street level is much smaller.
        </p>
        <div className="bar" style={{ width: "86%" }} />
        <div className="bar" style={{ width: "72%" }} />
        <div className="menu-at">
          <Menu />
        </div>
      </Frame>
    );
  return (
    <Frame side={<Panel />}>
      {[92, 80, 86, 64, 0, 90, 76, 84, 58].map((w, i) => (
        <div
          key={i}
          className="bar"
          style={{ width: `${w}%`, visibility: w ? "visible" : "hidden" }}
        />
      ))}
    </Frame>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
