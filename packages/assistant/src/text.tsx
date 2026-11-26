/**
 * The assistant's answers in a small, safe part of Markdown: paragraphs,
 * lists, code blocks, `code`, **bold** and *italic*, plus numbered
 * citations ([1]) when the app shows its sources. React elements only,
 * never HTML from the model.
 */

import type { ReactNode } from "react";

export type Block =
  | { kind: "p"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "ul" | "ol"; items: string[] };

/** Splits an answer into blocks. Text still streaming in closes an open code block. */
export function blocksOf(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      endPara();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++)
        code.push(lines[i]);
      blocks.push({ kind: "code", lang: fence[1], text: code.join("\n") });
      continue;
    }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      endPara();
      const kind = item[1] ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(item[3]);
      else blocks.push({ kind, items: [item[3]] });
      continue;
    }
    if (line.trim() === "") {
      endPara();
      continue;
    }
    // A line that goes on a list item belongs to it.
    const last = blocks[blocks.length - 1];
    if (
      para.length === 0 &&
      /^\s{2,}\S/.test(line) &&
      last &&
      (last.kind === "ul" || last.kind === "ol")
    ) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line.trim().replace(/^#{1,6}\s+/, ""));
  }
  endPara();
  return blocks;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[\d{1,3}\])/g;

/** The inline parts of one line. */
export function inline(text: string, onCite?: (n: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let at = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index;
    if (start > at) out.push(text.slice(at, start));
    const [whole, code, bold, italic, cite] = m;
    if (code) out.push(<code key={key++}>{code.slice(1, -1)}</code>);
    else if (bold) out.push(<strong key={key++}>{bold.slice(2, -2)}</strong>);
    else if (italic) out.push(<em key={key++}>{italic.slice(1, -1)}</em>);
    else if (cite && onCite) {
      const n = Number(cite.slice(1, -1));
      out.push(<Cite key={key++} n={n} onClick={() => onCite(n)} />);
    } else out.push(whole);
    at = start + whole.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** A source's number in an answer; opens the source's passage. */
export function Cite({ n, onClick }: { n: number; onClick?: () => void }) {
  return onClick ? (
    <button type="button" className="assistant-cite" onClick={onClick}>
      {n}
    </button>
  ) : (
    <span className="assistant-cite">{n}</span>
  );
}

export function AssistantText({
  text,
  onCite,
}: {
  text: string;
  onCite?: (n: number) => void;
}) {
  return (
    <div className="assistant-text">
      {blocksOf(text).map((block, i) => {
        if (block.kind === "code")
          return (
            <pre key={i} data-lang={block.lang || undefined}>
              <code>{block.text}</code>
            </pre>
          );
        if (block.kind === "p") return <p key={i}>{inline(block.text, onCite)}</p>;
        const List = block.kind;
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item, onCite)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
