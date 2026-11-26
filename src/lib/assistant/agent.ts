/**
 * What Polemic tells the model: the system message for each mode, and
 * the user's question with what they are looking at. The loop itself
 * is the shared one in @scholarkit/assistant.
 */

import type { CompileIssue } from "@/lib/tauri";
import { explainIssue } from "@/lib/explain-issue";
import type { AssistantMode } from "@/store/settings";

const COMMON = [
  "You are the assistant inside Polemic, a LaTeX editor. You work on the user's project through tools.",
  "Look before you answer: read the relevant files, search the project and check the compile issues instead of guessing.",
  "Change files only through propose_change. The user reviews every change as a diff and applies it; say so instead of claiming you changed anything.",
  "After the user applies a change, you may compile to check that it worked.",
  "Keep changes minimal and in the document's existing style. Prefer packages the document already loads.",
  "Answer briefly in plain sentences. Use Markdown code blocks for LaTeX you show. Reply in the user's language.",
];

const MODE: Record<AssistantMode, string> = {
  latex:
    "Your job is LaTeX itself: syntax, compile errors and warnings, packages, tables, floats, math, references, bibliographies, TikZ and layout. Do not write, rewrite, shorten or translate the author's text. If a fix needs a change to the text (an unescaped %, a broken reference), keep it to the minimum and say so.",
  writing:
    "Your job is polishing the author's text: grammar, word choice, clarity and flow. Never change what the text says. Keep every command, environment, citation, reference, label, math expression and number exactly as it is, and never add or drop a negation. Change one paragraph at a time. The app turns down any change that breaks these rules.",
};

/** `localTex`: the project compiles on this computer, where package_info can tell what is installed. */
export function systemPrompt(mode: AssistantMode, localTex = true): string {
  const packages = localTex
    ? "Check with package_info before suggesting a package the document doesn't load yet."
    : "The project compiles on Polemic's server, which has a full TeX Live; the user can't install packages or fonts there.";
  return [...COMMON, packages, MODE[mode]].join("\n");
}

/** What the user is looking at when they ask. */
export interface AskContext {
  activeFile: string | null;
  /** 1-based cursor line in the active file. */
  cursorLine: number | null;
  selection: { path: string; fromLine: number; toLine: number; text: string } | null;
  issue: CompileIssue | null;
  /** The compile ran on Polemic's server, where the reader can't
   *  install packages or fonts. */
  cloud?: boolean;
}

/** The user's message with its context, as the model reads it. */
export function userMessage(text: string, context: AskContext): string {
  const lines: string[] = [];
  if (context.activeFile !== null) {
    lines.push(
      `Open file: ${context.activeFile}${context.cursorLine !== null ? ` (cursor on line ${context.cursorLine})` : ""}`,
    );
  }
  if (context.selection !== null) {
    const { path, fromLine, toLine, text: selected } = context.selection;
    lines.push(
      `Selected in ${path}, lines ${fromLine}-${toLine}:`,
      "```latex",
      selected,
      "```",
    );
  }
  if (context.issue !== null) {
    const { severity, file, line, message, detail } = context.issue;
    lines.push(
      `About this ${severity}${file ? ` in ${file}${line !== null ? `:${line}` : ""}` : ""}: ${message}`,
      ...detail.map((d) => `  ${d}`),
    );
    // What the Issues panel told the user, so the answer builds on it.
    const { reading } = context.issue;
    if (reading) lines.push(`TeX was reading: ${reading}`);
    const explanation = explainIssue(context.issue, { cloud: context.cloud ?? false });
    if (explanation) {
      lines.push(`Shown to the user as: ${explanation.title}. ${explanation.help}`);
    }
  }
  if (lines.length === 0) return text;
  return `${lines.join("\n")}\n\n${text}`;
}

/** Told with the next question when the user switches modes mid-conversation. */
export function modeNote(mode: AssistantMode): string {
  return `(The user switched the assistant to ${mode === "latex" ? "LaTeX" : "Writing"} mode. From now on: ${MODE[mode]})`;
}
