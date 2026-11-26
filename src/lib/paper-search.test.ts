import { describe, expect, it } from "vitest";
import { paperEntry, type LookedUpWork } from "@/lib/paper-search";

const work = (extra: Partial<LookedUpWork> = {}): LookedUpWork => ({
  type: "article",
  author: ["Rasch, Björn", "Born, Jan"],
  editor: [],
  title: "About sleep's role in memory",
  year: "2013",
  container: "Physiological Reviews",
  publisher: "",
  place: "",
  volume: "93",
  issue: "2",
  pages: "681-766",
  doi: "10.1152/physrev.00032.2012",
  url: "",
  isbn: "",
  arxiv: "",
  pmid: "",
  ...extra,
});

describe("paperEntry", () => {
  it("writes an article with its journal, a key from the first author and year", () => {
    const entry = paperEntry(work(), []);
    expect(entry.key).toBe("rasch2013");
    expect(entry.raw).toBe(
      [
        "@article{rasch2013,",
        "  author = {Rasch, Björn and Born, Jan},",
        "  title = {About sleep's role in memory},",
        "  journal = {Physiological Reviews},",
        "  year = {2013},",
        "  volume = {93},",
        "  number = {2},",
        "  pages = {681--766},",
        "  doi = {10.1152/physrev.00032.2012},",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("takes a key no entry has, and a chapter's book as its booktitle", () => {
    const entry = paperEntry(work({ type: "chapter", container: "Sleep" }), [
      "rasch2013",
    ]);
    expect(entry.key).toBe("rasch20132");
    expect(entry.type).toBe("incollection");
    expect(entry.raw).toContain("booktitle = {Sleep}");
  });

  it("keeps a preprint's arXiv ID, and its address when it has no DOI", () => {
    const entry = paperEntry(
      work({
        type: "other",
        doi: "",
        arxiv: "1706.03762",
        url: "https://arxiv.org/abs/1706.03762",
      }),
      [],
    );
    expect(entry.type).toBe("misc");
    expect(entry.raw).toContain("eprint = {1706.03762}");
    expect(entry.raw).toContain("archiveprefix = {arXiv}");
    expect(entry.raw).toContain("url = {https://arxiv.org/abs/1706.03762}");
  });
});
