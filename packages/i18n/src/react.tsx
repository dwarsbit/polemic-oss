/**
 * Messages with markup: `rich("Press <0>Cmd+S</0> to compile.", [(c) => <kbd>{c}</kbd>])`.
 * Each numbered tag wraps text in the element its function returns, so
 * translators move the markup with the words. Tags don't nest.
 */

import { Fragment, type ReactNode } from "react";
import { t, type Values } from "./index";

export type Part = (children: ReactNode) => ReactNode;

/** Split a translated message into text and tagged pieces. */
export function splitTags(text: string): (string | { tag: number; text: string })[] {
  const pieces: (string | { tag: number; text: string })[] = [];
  const pattern = /<(\d+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    if (m.index > last) pieces.push(text.slice(last, m.index));
    pieces.push({ tag: Number(m[1]), text: m[2] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return pieces;
}

/** Translate a message with numbered tags and render each tag with its part. */
export function rich(
  message: string,
  parts: readonly Part[],
  values?: Values,
): ReactNode {
  return renderTags(t(message, values), parts);
}

/** Render an already translated message's numbered tags. */
export function renderTags(text: string, parts: readonly Part[]): ReactNode {
  return splitTags(text).map((piece, i) => (
    <Fragment key={i}>
      {typeof piece === "string"
        ? piece
        : (parts[piece.tag]?.(piece.text) ?? piece.text)}
    </Fragment>
  ));
}
