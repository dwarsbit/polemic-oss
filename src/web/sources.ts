/**
 * Bib sources in the browser build. On the desktop a bib source is a
 * .bib file or folder on disk; here it is one of your projects in the
 * account: `/projects/<id>` covers every .bib file in that project,
 * `/projects/<id>/<path>.bib` one file. The source commands of
 * src/lib/tauri.ts (list_bib_files, read_external_file) read the
 * project's document from the server, so a source follows the project
 * on every device.
 */

import * as Y from "yjs";
import { fromBase64, toBase64 } from "@/lib/share";
import { normalizePath, projectFiles, textAt } from "@/lib/project-doc";
import { request } from "@/web/server";
import { t } from "@scholarkit/i18n";

/** A bib source path, split into the project and the file in it (null:
 *  the whole project). Null for anything else. */
export function parseBibSourcePath(
  path: string,
): { id: string; file: string | null } | null {
  const match = /^\/projects\/([A-Za-z0-9_-]+)(?:\/(.+))?$/.exec(path);
  if (!match) return null;
  const [, id, rest] = match;
  if (rest === undefined || rest === "") return { id, file: null };
  const file = normalizePath(rest);
  if (!file || !file.toLowerCase().endsWith(".bib")) return null;
  return { id, file };
}

const isHidden = (path: string) => path.split("/").some((part) => part.startsWith("."));

/** The .bib files of a project document, sorted, dot folders left out. */
export function bibFilesOf(doc: Y.Doc): string[] {
  return [...projectFiles(doc).texts.keys()]
    .filter((path) => path.toLowerCase().endsWith(".bib") && !isHidden(path))
    .sort((a, b) => a.localeCompare(b));
}

/** How long a fetched document answers repeated reads: one refresh of
 *  the sources lists the files and then reads each of them. */
const FRESH_MS = 10_000;
const docs = new Map<string, { at: number; doc: Promise<Y.Doc> }>();

async function fetchDoc(id: string): Promise<Y.Doc> {
  const empty = toBase64(Y.encodeStateVector(new Y.Doc()));
  const { update } = await request<{ update: string; stateVector: string }>(
    `/api/projects/${id}/document/sync`,
    { method: "POST", json: { stateVector: empty } },
  );
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromBase64(update));
  return doc;
}

function projectDoc(id: string): Promise<Y.Doc> {
  const cached = docs.get(id);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.doc;
  const doc = fetchDoc(id);
  docs.set(id, { at: Date.now(), doc });
  // A failed fetch is asked again next time.
  doc.catch(() => {
    if (docs.get(id)?.doc === doc) docs.delete(id);
  });
  return doc;
}

/** Forget fetched documents (tests). */
export function clearSourceDocs(): void {
  docs.clear();
}

function notASource(path: string): string {
  return t("{path} isn't a project or a .bib file in one.", { path });
}

async function listBibFiles(path: string): Promise<string[]> {
  const parsed = parseBibSourcePath(path);
  if (!parsed) throw notASource(path);
  const files = bibFilesOf(await projectDoc(parsed.id));
  const base = `/projects/${parsed.id}/`;
  if (parsed.file === null) return files.map((file) => base + file);
  if (!files.includes(parsed.file))
    throw t("{file} doesn't exist.", { file: parsed.file });
  return [base + parsed.file];
}

async function readBibFile(path: string): Promise<string> {
  const parsed = parseBibSourcePath(path);
  if (!parsed || parsed.file === null) throw notASource(path);
  const text = textAt(await projectDoc(parsed.id), parsed.file);
  if (!text) throw t("{file} doesn't exist.", { file: parsed.file });
  return text.toString();
}

type Args = Record<string, unknown>;

export const sourceCommands: Record<string, (args: Args) => unknown> = {
  list_bib_files: (args) => listBibFiles(String(args.path ?? "")),
  read_external_file: (args) => readBibFile(String(args.path ?? "")),
};
