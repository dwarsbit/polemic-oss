/**
 * Working together in a rich-text face (Polemic's Visual): bringing in
 * what others changed without starting the document over, and showing
 * which block each of them is in.
 */

import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { StepMap } from "@tiptap/pm/transform";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Marks a transaction that brought in a change from elsewhere. */
export const FROM_ELSEWHERE = "collabFromElsewhere";

/** The one part where `a` and `b` differ: `a`'s [start, endA) became `b`'s [start, endB). */
export function differingPart(
  a: ProseNode,
  b: ProseNode,
): { start: number; endA: number; endB: number } | null {
  const start = a.content.findDiffStart(b.content);
  if (start === null) return null;
  const end = a.content.findDiffEnd(b.content);
  let endA = end?.a ?? a.content.size;
  let endB = end?.b ?? b.content.size;
  // Repeated content can make the end overlap the start; move both ends past it.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  return { start, endA, endB };
}

/**
 * Brings `next`, the document as it is after someone else's change, into
 * the editor as one change over the part that differs, so your caret and
 * selection outside it stay where they are. `base` is the document as
 * the change was made from; the edits made here since then are carried
 * over. The change can't be undone here. False when nothing changed, or
 * when the change doesn't fit and the caller should reload instead.
 */
export function mergeDoc(
  editor: Editor,
  next: ProseNode,
  base: ProseNode | null,
): boolean {
  if (editor.isDestroyed) return false;
  const { state } = editor;
  const theirs = differingPart(base ?? state.doc, next);
  if (!theirs) return false;
  const ours = base ? differingPart(base, state.doc) : null;
  const here = ours
    ? new StepMap([ours.start, ours.endA - ours.start, ours.endB - ours.start])
    : StepMap.empty;
  const from = here.map(theirs.start, -1);
  const to = Math.max(from, here.map(theirs.endA, 1));
  try {
    const tr = state.tr.replace(from, to, next.slice(theirs.start, theirs.endB));
    if (!tr.docChanged) return false;
    tr.setMeta(FROM_ELSEWHERE, true).setMeta("addToHistory", false);
    editor.view.dispatch(tr);
    return true;
  } catch {
    return false;
  }
}

/** Someone else in the document, in the block at `pos`. */
export interface RemoteBlock {
  id: string;
  name: string;
  color: string;
  pos: number;
}

const blockKey = new PluginKey<DecorationSet>("collabRemoteBlocks");

function decorate(doc: ProseNode, blocks: RemoteBlock[]): DecorationSet {
  const found: Decoration[] = [];
  const taken = new Set<number>();
  for (const block of blocks) {
    const pos = Math.max(0, Math.min(block.pos, doc.content.size));
    const $pos = doc.resolve(pos);
    if ($pos.depth < 1) continue;
    const start = $pos.before(1);
    // One name per block: the first person in it.
    if (taken.has(start)) continue;
    taken.add(start);
    found.push(
      Decoration.node(start, $pos.after(1), {
        class: "collab-block",
        style: `--caret: ${block.color}`,
        "data-collab-name": block.name,
      }),
    );
  }
  return DecorationSet.create(doc, found);
}

/** Shows which block each of the others is in; the marks move with changes until their next update. */
export const RemoteBlocks = Extension.create({
  name: "collabRemoteBlocks",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: blockKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, value) {
            const given = tr.getMeta(blockKey) as RemoteBlock[] | undefined;
            if (given) return decorate(tr.doc, given);
            return tr.docChanged ? value.map(tr.mapping, tr.doc) : value;
          },
        },
        props: {
          decorations: (state) => blockKey.getState(state),
        },
      }),
    ];
  },
});

/** Shows these people's blocks, in place of the ones shown before. */
export function setRemoteBlocks(editor: Editor, blocks: RemoteBlock[]): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(blockKey, blocks).setMeta("addToHistory", false),
  );
}
