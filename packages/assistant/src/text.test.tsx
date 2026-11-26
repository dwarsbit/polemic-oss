import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { blocksOf, inline } from "./text";

describe("blocksOf", () => {
  it("reads paragraphs, lists and code blocks", () => {
    expect(
      blocksOf(
        "Add it to the preamble:\n\n```latex\n\\usepackage{booktabs}\n```\n- one\n- two\n  goes on\n1. first\n\nLast line\nwraps.",
      ),
    ).toEqual([
      { kind: "p", text: "Add it to the preamble:" },
      { kind: "code", lang: "latex", text: "\\usepackage{booktabs}" },
      { kind: "ul", items: ["one", "two goes on"] },
      { kind: "ol", items: ["first"] },
      { kind: "p", text: "Last line wraps." },
    ]);
  });

  it("shows a code block still streaming in", () => {
    expect(blocksOf("```\n\\begin{table}")).toEqual([
      { kind: "code", lang: "", text: "\\begin{table}" },
    ]);
  });
});

describe("inline", () => {
  const kinds = (nodes: ReturnType<typeof inline>) =>
    nodes.map((n) =>
      isValidElement(n)
        ? String(
            (n as ReactElement).type === "code" ? "code" : (n as ReactElement).type,
          )
        : n,
    );

  it("reads code, bold and italic, never HTML", () => {
    const nodes = inline("Use `\\toprule` from **booktabs**, *not* <b>this</b>.");
    expect(kinds(nodes)).toEqual([
      "Use ",
      "code",
      " from ",
      "strong",
      ", ",
      "em",
      " <b>this</b>.",
    ]);
  });

  it("turns [1] into a citation only when the app shows sources", () => {
    expect(inline("Cooler by 30 °C [1].")).toEqual(["Cooler by 30 °C ", "[1]", "."]);
    const nodes = inline("Cooler [1].", () => {});
    expect(isValidElement(nodes[1])).toBe(true);
  });
});
