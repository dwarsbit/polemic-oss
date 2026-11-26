/**
 * Papers by their title or authors, from OpenAlex, through the Scholarkit
 * server (GET /api/lookup/search): never straight from OpenAlex. Plus finds
 * titles, authors and DOIs; picking one looks up the rest by its OpenAlex
 * ID (GET /api/lookup/work?kind=openalex), which costs nothing. Pro gets
 * every detail at once. Shapes follow `foundPaper` in @scholarkit/contracts.
 */

import { formatEntry, suggestKey } from "@/lib/bib-entries";
import { accountLookup } from "@/lib/tauri";

/** A work as the server's lookup answers it (`lookedUpWork` in @scholarkit/contracts). */
export interface LookedUpWork {
  type:
    | "article"
    | "book"
    | "chapter"
    | "conference"
    | "thesis"
    | "report"
    | "webpage"
    | "other";
  /** Names as "Family, Given". */
  author: string[];
  editor: string[];
  title: string;
  year: string;
  container: string;
  publisher: string;
  place: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  url: string;
  isbn: string;
  arxiv: string;
  pmid: string;
}

export type FoundPaper = LookedUpWork & {
  openAlexId: string;
  freePdf: boolean;
  /** False when the search gave only the title, authors and DOI (Plus). */
  detailed: boolean;
};

export interface PaperSearch {
  works: FoundPaper[];
  /** Found on Plus: Pro shows each paper's details too. */
  betterWithPro?: boolean;
}

/** The server said no: `plus_needed`, `unauthorized`, `rate_limited`… */
export class PaperSearchError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function lookup<T>(path: string): Promise<T> {
  const { status, body } = await accountLookup(path);
  if (status >= 200 && status < 300) return body as T;
  const { error, message } = (body ?? {}) as { error?: unknown; message?: unknown };
  throw new PaperSearchError(
    status,
    typeof error === "string" ? error : "",
    typeof message === "string" ? message : `The server answered ${status}.`,
  );
}

export function searchPapers(q: string): Promise<PaperSearch> {
  return lookup<PaperSearch>(
    `/api/lookup/search?${new URLSearchParams({ q }).toString()}`,
  );
}

/** The paper with every detail: as found, or looked up by its OpenAlex ID. */
export async function paperDetails(paper: FoundPaper): Promise<LookedUpWork> {
  if (paper.detailed || !paper.openAlexId) return paper;
  try {
    const { work } = await lookup<{ work: LookedUpWork }>(
      `/api/lookup/work?${new URLSearchParams({ kind: "openalex", id: paper.openAlexId }).toString()}`,
    );
    return work;
  } catch {
    return paper;
  }
}

const BIB_TYPES: Record<LookedUpWork["type"], string> = {
  article: "article",
  book: "book",
  chapter: "incollection",
  conference: "inproceedings",
  thesis: "phdthesis",
  report: "techreport",
  webpage: "misc",
  other: "misc",
};

/** The work as a BibTeX entry, with a key no entry in `taken` has. */
export function paperEntry(
  work: LookedUpWork,
  taken: string[],
): { key: string; type: string; raw: string } {
  const type = BIB_TYPES[work.type] ?? "misc";
  const fields: { name: string; value: string }[] = [];
  const push = (name: string, value: string) => {
    if (value.trim()) fields.push({ name, value: value.trim() });
  };
  push("author", work.author.join(" and "));
  if (!work.author.length) push("editor", work.editor.join(" and "));
  push("title", work.title);
  if (type === "article") push("journal", work.container);
  else if (type === "incollection" || type === "inproceedings")
    push("booktitle", work.container);
  else if (type === "misc" && work.container) push("howpublished", work.container);
  push("year", work.year);
  push("volume", work.volume);
  push("number", work.issue);
  push("pages", work.pages.replace(/(\d)-(\d)/, "$1--$2"));
  if (type === "phdthesis") push("school", work.publisher);
  else if (type === "techreport") push("institution", work.publisher);
  else push("publisher", work.publisher);
  push("address", work.place);
  push("isbn", work.isbn);
  push("doi", work.doi);
  if (work.arxiv) {
    push("eprint", work.arxiv);
    push("archiveprefix", "arXiv");
  }
  push("pmid", work.pmid);
  if (!work.doi) push("url", work.url);
  const key = suggestKey(type, fields, taken);
  return { key, type, raw: formatEntry(type, key, fields) };
}
