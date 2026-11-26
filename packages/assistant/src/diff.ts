/**
 * Line diffs for the change cards: what a proposed change adds and removes,
 * with a few lines around each change for context.
 */

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
  /** The line's number in the new text; in the old text for a removed line. */
  number: number;
}

export interface DiffHunk {
  lines: DiffLine[];
}

export interface LineDiff {
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

/** Above this many lines on either side the diff compares only the changed middle. */
const MAX_LINES = 4000;

function split(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
}

/** The edit script between two texts, by longest common subsequence. */
function script(a: string[], b: string[]): DiffLine[] {
  // The common head and tail first, so a small change in a long file stays cheap.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  const am = a.slice(head, a.length - tail);
  const bm = b.slice(head, b.length - tail);
  const out: DiffLine[] = a
    .slice(0, head)
    .map((text, i) => ({ kind: "same", text, number: i + 1 }));

  let middle: Array<"same" | "add" | "del"> = [];
  if (
    am.length > MAX_LINES ||
    bm.length > MAX_LINES ||
    am.length * bm.length > 4_000_000
  ) {
    middle = [...am.map(() => "del" as const), ...bm.map(() => "add" as const)];
  } else {
    const w = bm.length + 1;
    const lcs = new Uint32Array((am.length + 1) * w);
    for (let i = am.length - 1; i >= 0; i--)
      for (let j = bm.length - 1; j >= 0; j--)
        lcs[i * w + j] =
          am[i] === bm[j]
            ? lcs[(i + 1) * w + j + 1] + 1
            : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < am.length || j < bm.length) {
      if (i < am.length && j < bm.length && am[i] === bm[j]) {
        middle.push("same");
        i++;
        j++;
      } else if (
        j < bm.length &&
        (i === am.length || lcs[i * w + j + 1] > lcs[(i + 1) * w + j])
      ) {
        middle.push("add");
        j++;
      } else {
        middle.push("del");
        i++;
      }
    }
  }
  let i = head;
  let j = head;
  for (const kind of middle) {
    if (kind === "del") {
      out.push({ kind, text: a[i], number: i + 1 });
      i++;
    } else {
      out.push({ kind, text: b[j], number: j + 1 });
      j++;
      if (kind === "same") i++;
    }
  }
  for (let k = 0; k < tail; k++, j++)
    out.push({ kind: "same", text: b[j], number: j + 1 });
  return out;
}

/** What changed from `before` to `after`, in hunks with `context` lines around each change. */
export function lineDiff(before: string, after: string, context = 2): LineDiff {
  const lines = script(split(before), split(after));
  const added = lines.filter((l) => l.kind === "add").length;
  const removed = lines.filter((l) => l.kind === "del").length;
  const keep = lines.map(() => false);
  lines.forEach((line, k) => {
    if (line.kind === "same") return;
    for (
      let c = Math.max(0, k - context);
      c <= Math.min(lines.length - 1, k + context);
      c++
    )
      keep[c] = true;
  });
  const hunks: DiffHunk[] = [];
  let current: DiffLine[] | null = null;
  lines.forEach((line, k) => {
    if (!keep[k]) {
      current = null;
      return;
    }
    if (!current) {
      current = [];
      hunks.push({ lines: current });
    }
    current.push(line);
  });
  return { added, removed, hunks };
}
