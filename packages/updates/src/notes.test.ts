import { describe, expect, it } from "vitest";
import { parseNotes, parseSpans } from "./notes";

describe("parseSpans", () => {
  it("splits bold and code, and keeps a link's text", () => {
    expect(
      parseSpans("Open **Settings** and type `\\section`, see [the guide](https://x)."),
    ).toEqual([
      { text: "Open " },
      { text: "Settings", bold: true },
      { text: " and type " },
      { text: "\\section", code: true },
      { text: ", see the guide." },
    ]);
  });
});

describe("parseNotes", () => {
  it("reads headings, lists and paragraphs", () => {
    const notes = [
      "### Added",
      "",
      "- Export to **PowerPoint**.",
      "- Save a PDF with no print window,",
      "  in A4 or Letter.",
      "",
      "### Fixed",
      "",
      "Pasting a table kept its header row.",
    ].join("\n");
    expect(parseNotes(notes)).toEqual([
      { kind: "heading", spans: [{ text: "Added" }] },
      {
        kind: "list",
        items: [
          [{ text: "Export to " }, { text: "PowerPoint", bold: true }, { text: "." }],
          [{ text: "Save a PDF with no print window," }, { text: " in A4 or Letter." }],
        ],
      },
      { kind: "heading", spans: [{ text: "Fixed" }] },
      { kind: "paragraph", spans: [{ text: "Pasting a table kept its header row." }] },
    ]);
  });

  it("gives nothing for empty notes", () => {
    expect(parseNotes("")).toEqual([]);
  });
});
