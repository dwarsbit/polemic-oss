/**
 * The live connection of a shared, linked project in the desktop app,
 * as the browser build has one: the others' edits arrive as they type
 * them, and who else is in the project shows with their cursors.
 *
 * The connection keeps a replica of the server's document, which this
 * app never edits: edits still go through the link (src/lib/link-sync.ts),
 * which saves into the folder and merges. The replica says when
 * something changed, so the link fetches it right away instead of at
 * its next poll, and it carries presence (src/lib/live-presence.ts).
 *
 * The account token stays in the Rust side: the connection signs in
 * with a sync ticket, a fresh one on every (re)connect.
 */

import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

/** How long the first sync may take before the connection counts as failed. */
const CONNECT_TIMEOUT_MS = 30_000;

export interface DesktopLive {
  /** The replica of the server's document. */
  doc: Y.Doc;
  provider: HocuspocusProvider;
  close(): void;
}

export interface LiveOptions {
  /** The account's server, e.g. https://app.scholarkit.app. */
  server: string;
  projectId: string;
  /** The ticket to connect with first. */
  ticket: string;
  /** A fresh ticket, for each reconnect. */
  nextTicket: () => Promise<string>;
  /** The server's document changed. */
  onChange: () => void;
  /** The server no longer lets the connection in, as after you left the project. */
  onLost: () => void;
}

/** The sync address of `server`: its /api/sync over a WebSocket. */
export const liveUrl = (server: string) =>
  `${server.replace(/\/+$/, "").replace(/^http/, "ws")}/api/sync`;

/** Opens the connection; resolves once the replica has the server's copy. */
export function openLive(options: LiveOptions): Promise<DesktopLive> {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc();
    let first: string | null = options.ticket;
    let open = false;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      doc.off("update", onUpdate);
      provider.destroy();
      doc.destroy();
    };
    const onUpdate = () => {
      if (open) options.onChange();
    };
    const timer = setTimeout(() => {
      close();
      reject(new Error("The live connection timed out"));
    }, CONNECT_TIMEOUT_MS);
    const provider = new HocuspocusProvider({
      url: liveUrl(options.server),
      name: options.projectId,
      token: async () => {
        const ticket = first;
        first = null;
        return ticket ?? (await options.nextTicket().catch(() => ""));
      },
      document: doc,
      onSynced: () => {
        if (open || closed) return;
        open = true;
        clearTimeout(timer);
        resolve({ doc, provider, close });
      },
      onAuthenticationFailed: () => {
        const wasOpen = open;
        close();
        if (wasOpen) options.onLost();
        else reject(new Error("The server refused the live connection"));
      },
    });
    doc.on("update", onUpdate);
  });
}
