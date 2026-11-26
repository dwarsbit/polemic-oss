// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { colorFor, firstName, initials, onePerPerson, COLORS } from "./people";
import { liveStatus, liveWith } from "./status";
import { RemoteBlocks, differingPart, mergeDoc, setRemoteBlocks } from "./prosemirror";

describe("people", () => {
  it("gives one account the same color every time", () => {
    expect(colorFor("user-1")).toBe(colorFor("user-1"));
    expect(COLORS).toContain(colorFor("someone else"));
  });

  it("writes initials and first names without titles", () => {
    expect(initials("Anna de Vries")).toBe("AV");
    expect(initials("Prof. Tom Bakker")).toBe("TB");
    expect(initials("  ")).toBe("?");
    expect(firstName("Dr. Mira Kos")).toBe("Mira");
  });

  it("keeps one entry per person, leaving you out", () => {
    const people = onePerPerson(
      [
        { id: "t", name: "Tom", where: null },
        { id: "a", name: "Anna", where: "main.tex" },
        { id: "t", name: "Tom", where: "intro.tex" },
        { id: "me", name: "Me", where: "main.tex" },
      ],
      "me",
    );
    expect(people).toEqual([
      { id: "a", name: "Anna", where: "main.tex" },
      { id: "t", name: "Tom", where: "intro.tex" },
    ]);
  });
});

describe("status", () => {
  it("names who is in", () => {
    expect(liveWith([])).toBeNull();
    expect(liveWith(["Anna de Vries"])).toBe("Live with Anna");
    expect(liveWith(["Anna de Vries", "Tom Bakker"])).toBe("Live with Anna and Tom");
    expect(liveWith(["Anna", "Tom", "Mira", "Lars"])).toBe(
      "Live with Anna, Tom and 2 others",
    );
  });

  it("says when the connection is down, and nothing when alone", () => {
    expect(liveStatus({ names: [], connection: "connected" })).toBeNull();
    expect(liveStatus({ names: [], connection: "connecting" })).toEqual({
      text: "Reconnecting… Your changes are kept.",
      tone: "warn",
    });
    expect(
      liveStatus({ names: ["Anna"], connection: "connected", readOnly: true }),
    ).toEqual({ text: "Read only · Live with Anna", tone: "muted" });
  });
});

describe("prosemirror", () => {
  let editor: Editor | null = null;
  afterEach(() => editor?.destroy());

  const make = (html: string) => {
    editor = new Editor({ extensions: [StarterKit, RemoteBlocks], content: html });
    return editor;
  };

  it("finds the one part that differs", () => {
    const e = make("<p>one</p><p>two</p>");
    const next = e.schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph", content: [{ type: "text", text: "twos" }] },
      ],
    });
    expect(differingPart(e.state.doc, next)).toEqual({ start: 9, endA: 9, endB: 10 });
  });

  it("brings in their change and keeps your caret and your own edit", () => {
    const e = make("<p>alpha</p><p>beta</p>");
    const base = e.state.doc;
    // You typed in the first paragraph and your caret sits after it.
    e.commands.insertContentAt(6, "!");
    e.commands.setTextSelection(7);
    // They changed the second paragraph.
    const next = e.schema.nodeFromJSON({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
        { type: "paragraph", content: [{ type: "text", text: "beta gamma" }] },
      ],
    });
    expect(mergeDoc(e, next, base)).toBe(true);
    expect(e.getText()).toBe("alpha!\n\nbeta gamma");
    expect(e.state.selection.from).toBe(7);
    expect(mergeDoc(e, next, next)).toBe(false);
  });

  it("marks the block each person is in", () => {
    const e = make("<p>alpha</p><p>beta</p>");
    setRemoteBlocks(e, [{ id: "a", name: "Anna", color: "#c2255c", pos: 9 }]);
    const marked = e.view.dom.querySelectorAll(".collab-block");
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toBe("beta");
    expect(marked[0]!.getAttribute("data-collab-name")).toBe("Anna");
  });
});
