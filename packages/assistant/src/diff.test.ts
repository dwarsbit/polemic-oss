import { describe, expect, it } from "vitest";
import { lineDiff } from "./diff";

describe("lineDiff", () => {
  it("shows an added line with the lines around it", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
    const after = ["a", "b", "c", "d", "X", "e", "f", "g"].join("\n");
    const diff = lineDiff(before, after);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0].lines.map((l) => `${l.kind}:${l.number}:${l.text}`)).toEqual([
      "same:3:c",
      "same:4:d",
      "add:5:X",
      "same:6:e",
      "same:7:f",
    ]);
  });

  it("numbers removed lines in the old text, and splits far changes into hunks", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const after = before.replace("line 2\n", "").replace("line 18", "line eighteen");
    const diff = lineDiff(before, after, 1);
    expect(diff).toMatchObject({ added: 1, removed: 2 });
    expect(diff.hunks).toHaveLength(2);
    expect(diff.hunks[0].lines.find((l) => l.kind === "del")).toEqual({
      kind: "del",
      text: "line 2",
      number: 2,
    });
    expect(
      diff.hunks[1].lines
        .filter((l) => l.kind !== "same")
        .map((l) => `${l.kind}:${l.number}`),
    ).toEqual(["del:18", "add:17"]);
  });

  it("handles new and emptied files", () => {
    expect(lineDiff("", "one\ntwo\n")).toMatchObject({ added: 2, removed: 0 });
    expect(lineDiff("one\n", "")).toMatchObject({ added: 0, removed: 1 });
    expect(lineDiff("same\n", "same")).toMatchObject({
      added: 0,
      removed: 0,
      hunks: [],
    });
  });
});
