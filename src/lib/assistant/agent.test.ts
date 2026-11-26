import { describe, expect, it } from "vitest";
import { systemPrompt, userMessage } from "./agent";
import { explainIssue } from "@/lib/explain-issue";

describe("prompts", () => {
  it("sets the job by mode", () => {
    expect(systemPrompt("latex")).toMatch(/Do not write, rewrite/);
    expect(systemPrompt("writing")).toMatch(/Never change what the text says/);
    expect(systemPrompt("latex")).toMatch(/package_info/);
    expect(systemPrompt("latex", false)).not.toMatch(/package_info/);
  });

  it("puts the context before the question", () => {
    expect(
      userMessage("Why?", {
        activeFile: "main.tex",
        cursorLine: 4,
        selection: { path: "main.tex", fromLine: 2, toLine: 3, text: "a\nb" },
        issue: null,
      }),
    ).toBe(
      "Open file: main.tex (cursor on line 4)\nSelected in main.tex, lines 2-3:\n```latex\na\nb\n```\n\nWhy?",
    );
    expect(
      userMessage("Hi", {
        activeFile: null,
        cursorLine: null,
        selection: null,
        issue: null,
      }),
    ).toBe("Hi");
  });

  it("gives an issue with what the user was told about it", () => {
    const message = userMessage("Fix this error.", {
      activeFile: null,
      cursorLine: null,
      selection: null,
      issue: {
        severity: "error",
        file: "main.tex",
        line: 7,
        message: "Undefined control sequence.",
        detail: ["l.7 \\mycmd"],
        reading: "\\mycmd ->\\frrac",
      },
    });
    expect(message).toBe(
      [
        "About this error in main.tex:7: Undefined control sequence.",
        "  l.7 \\mycmd",
        "TeX was reading: \\mycmd ->\\frrac",
        "Shown to the user as: Unknown command \\frrac. " +
          explainIssue(
            {
              severity: "error",
              file: null,
              line: null,
              message: "Undefined control sequence.",
              detail: [],
            },
            { cloud: false },
          )!.help,
        "",
        "Fix this error.",
      ].join("\n"),
    );
  });
});
