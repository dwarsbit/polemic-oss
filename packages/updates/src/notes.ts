// The release notes of a version are its section of the app's changelog, in Markdown. What's new
// shows them with the little Markdown the changelogs use: ### headings, - lists, **bold**,
// `code` and [links](…), whose text shows without the address.

export type Span = { text: string; bold?: boolean; code?: boolean };

export type NoteBlock =
  | { kind: "heading"; spans: Span[] }
  | { kind: "list"; items: Span[][] }
  | { kind: "paragraph"; spans: Span[] };

/** Splits a line into plain, bold and code text. */
export function parseSpans(line: string): Span[] {
  const spans: Span[] = [];
  const text = line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) spans.push({ text: text.slice(at, match.index) });
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true });
    else spans.push({ text: match[2]!, code: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) spans.push({ text: text.slice(at) });
  return spans;
}

export function parseNotes(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length)
      blocks.push({ kind: "paragraph", spans: parseSpans(paragraph.join(" ")) });
    paragraph = [];
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (!line) {
      endParagraph();
    } else if (heading) {
      endParagraph();
      blocks.push({ kind: "heading", spans: parseSpans(heading[1]!) });
    } else if (item) {
      endParagraph();
      const last = blocks.at(-1);
      if (last?.kind === "list") last.items.push(parseSpans(item[1]!));
      else blocks.push({ kind: "list", items: [parseSpans(item[1]!)] });
    } else if (
      raw.startsWith("  ") &&
      blocks.at(-1)?.kind === "list" &&
      !paragraph.length
    ) {
      // A list item that wraps onto the next line.
      const list = blocks.at(-1) as Extract<NoteBlock, { kind: "list" }>;
      list.items[list.items.length - 1]!.push(...parseSpans(` ${line}`));
    } else {
      paragraph.push(line);
    }
  }
  endParagraph();
  return blocks;
}
