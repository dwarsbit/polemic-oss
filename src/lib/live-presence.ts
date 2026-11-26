/**
 * Presence on a project's live connection: who else has the project
 * open, which file they're in and where their cursor is. The browser
 * build shares it on the project's own connection, the desktop app on
 * the live connection of a shared, linked project. It travels as
 * awareness; the server sets who each state belongs to (`user`), so
 * nobody shows up under another name. Cursors are relative positions
 * in the file's Y.Text, so they stay put while others type.
 */

import type { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { carryOffset, textAt } from "@/lib/project-doc";
import {
  setPresenceReporter,
  usePresenceStore,
  type Peer,
  type reportPresence,
} from "@/store/presence";
import { colorFor } from "@scholarkit/collab";
import { t } from "@scholarkit/i18n";

type Awareness = NonNullable<HocuspocusProvider["awareness"]>;

/** A project's live connection: its document and the provider that keeps it. */
export interface LiveProject {
  doc: Y.Doc;
  provider: HocuspocusProvider;
}

/** What this window shares. */
interface LocalPresence {
  file: string | null;
  cursor: { anchor: unknown; head: unknown } | null;
}

function resolve(doc: Y.Doc, ytext: Y.Text, json: unknown): number | null {
  try {
    const position = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(json),
      doc,
    );
    return position && position.type === ytext ? position.index : null;
  } catch {
    return null;
  }
}

/** Everyone in the project but this tab and the account's other tabs. */
export function peersOf(
  open: { doc: Y.Doc },
  awareness: Awareness,
  selfId: string | null,
): Peer[] {
  const peers: Peer[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (clientId === awareness.clientID) continue;
    const user = state.user as { id?: unknown; name?: unknown } | undefined;
    const userId = typeof user?.id === "string" ? user.id : `client-${clientId}`;
    if (userId === selfId) continue;
    const name =
      typeof user?.name === "string" && user.name !== "" ? user.name : t("Someone");
    const file = typeof state.file === "string" ? state.file : null;
    let selection: Peer["selection"] = null;
    let text: string | null = null;
    const cursor = state.cursor as LocalPresence["cursor"] | undefined;
    const ytext = file ? textAt(open.doc, file) : null;
    if (ytext && cursor) {
      const anchor = resolve(open.doc, ytext, cursor.anchor);
      const head = resolve(open.doc, ytext, cursor.head);
      if (anchor !== null && head !== null) {
        selection = { anchor, head };
        text = ytext.toString();
      }
    }
    peers.push({
      clientId,
      userId,
      name,
      color: colorFor(userId),
      file,
      selection,
      text,
    });
  }
  return peers.sort((a, b) => a.name.localeCompare(b.name) || a.clientId - b.clientId);
}

type Report = Parameters<typeof reportPresence>;

let target: { open: LiveProject; awareness: Awareness } | null = null;
let sent = "";
/** The editor's last report, shared again on a connection opened after it. */
let last: Report = [null, null];

/**
 * Shares this window's presence on `open` and follows the others';
 * returns how to stop. `selfId` is the account, whose other windows
 * don't count as someone else.
 */
export function attachPresence(
  open: LiveProject,
  selfId: () => Promise<string | null>,
): () => void {
  const awareness = open.provider.awareness;
  if (!awareness) return () => {};
  const mine = { open, awareness };
  target = mine;
  sent = "";
  share(...last);
  let self: string | null = null;
  let frame = 0;
  const refresh = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      usePresenceStore.setState({ peers: peersOf(open, awareness, self) });
    });
  };
  void selfId().then((id) => {
    self = id;
    refresh();
  });
  awareness.on("change", refresh);
  // Their cursors move with the text as it changes.
  open.doc.on("update", refresh);
  refresh();
  // Whether the connection is up, for the status line.
  const onStatus = ({ status }: { status: string }) =>
    usePresenceStore.setState({
      connection: status === "connected" ? "connected" : "connecting",
    });
  open.provider.on("status", onStatus);
  return () => {
    awareness.off("change", refresh);
    open.doc.off("update", refresh);
    open.provider.off("status", onStatus);
    cancelAnimationFrame(frame);
    if (target === mine) target = null;
    usePresenceStore.setState({ peers: [], connection: "connected" });
  };
}

/** Passes this window's file and cursor to the attached connection; returns a stop. */
export function startPresenceReporter(): () => void {
  setPresenceReporter((...report) => {
    last = report;
    share(...report);
  });
  return () => setPresenceReporter(null);
}

/** Shares the file and cursor on the attached connection. */
function share(...[file, selection]: Report) {
  if (!target) return;
  const { open, awareness } = target;
  const state: LocalPresence = { file, cursor: null };
  const ytext = file ? textAt(open.doc, file) : null;
  if (ytext && selection) {
    // The editor may hold edits the document doesn't have yet.
    const live = ytext.toString();
    const position = (offset: number) =>
      Y.relativePositionToJSON(
        Y.createRelativePositionFromTypeIndex(
          ytext,
          carryOffset(selection.text, live, offset),
        ),
      );
    state.cursor = {
      anchor: position(selection.anchor),
      head: position(selection.head),
    };
  }
  const json = JSON.stringify(state);
  if (json === sent) return;
  sent = json;
  awareness.setLocalState(state);
}
