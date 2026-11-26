/**
 * The tools contract: what an app gives the model to work with. Every
 * tool is one of three kinds, and the kind is a promise to the person:
 *
 * - `read` looks and never changes anything: read a file, search the
 *   sources, check a quote. It runs right away.
 * - `propose` prepares a change and hands it to the person as a card to
 *   review (a diff, a paper to cite, a note to save). It never writes.
 * - `ask` does something only after the person allows it, such as a
 *   compile. The app asks; the step list shows that it waits.
 *
 * A tool answers the model in plain text. It may hand the panel an
 * attachment too, such as the card a `propose` tool made.
 */

import type { ToolSpec } from "./types";

export type ToolKind = "read" | "propose" | "ask";

export type ToolArgs = Record<string, unknown>;

export interface ToolOutcome<A> {
  /** What the model reads back. */
  result: string;
  /** What the panel shows, after the reply: a review card. */
  attachment?: A;
}

export interface Tool<A = never> {
  name: string;
  /** For the model: what the tool does and when to use it. */
  description: string;
  /** JSON Schema of the arguments. */
  parameters: object;
  kind: ToolKind;
  run(args: ToolArgs): Promise<string | ToolOutcome<A>>;
  /** The step as the person reads it, such as "Read main.tex". Translated by the app. */
  describe(args: ToolArgs, result: string): string;
}

export interface Toolkit<A = never> {
  specs: ToolSpec[];
  get(name: string): Tool<A> | undefined;
}

/** The names the model may call: what OpenAI-shaped APIs accept. */
export const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/** At most this many tools a turn, as the server takes. */
export const MAX_TOOLS = 48;

/** Puts an app's tools together. Throws on a bad or repeated name. */
export function toolkit<A = never>(tools: Tool<A>[]): Toolkit<A> {
  if (tools.length > MAX_TOOLS)
    throw new Error(`At most ${MAX_TOOLS} tools, not ${tools.length}.`);
  const byName = new Map<string, Tool<A>>();
  for (const tool of tools) {
    if (!TOOL_NAME.test(tool.name)) throw new Error(`Bad tool name: ${tool.name}`);
    if (byName.has(tool.name)) throw new Error(`Two tools named ${tool.name}`);
    byName.set(tool.name, tool);
  }
  return {
    specs: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
    get: (name) => byName.get(name),
  };
}

/** A string argument, or null when it is missing or not a string. */
export function stringArg(args: ToolArgs, name: string): string | null {
  const value = args[name];
  return typeof value === "string" ? value : null;
}
