/**
 * Compile issues in plain words. TeX's messages are terse and written
 * for someone at a terminal ("Undefined control sequence."); this
 * catalog gives the common ones a title with the specifics ("Unknown
 * command \frrac") and a line on what to do. Issues outside the catalog
 * keep TeX's message. It runs on issues from either log reader (the
 * desktop app's and the browser's), so the wording lives in one place.
 */

import type { CompileIssue } from "@/lib/tauri";
import { t } from "@scholarkit/i18n";

export interface Explanation {
  /** The issue in plain words, with its specifics. A label: no full stop. */
  title: string;
  /** What it means and what to do about it. */
  help: string;
  /**
   * What several issues of this kind are called after their number:
   * "citations without a bibliography entry". Issues that share it
   * can be listed as one.
   */
  many?: string;
  /** Something Polemic can do about it, offered next to the advice. */
  action?: IssueAction;
  /** The section of the guide to LaTeX errors that covers it. */
  topic?: Topic;
}

export type IssueAction =
  /** Compile with one of these engines instead. */
  | { kind: "engine"; engines: UnicodeEngine[] }
  /** Look the package or class up on CTAN. */
  | { kind: "ctan"; name: string };

export type UnicodeEngine = "xelatex" | "lualatex";

export type Topic =
  | "commands"
  | "files"
  | "engine-and-fonts"
  | "math"
  | "braces"
  | "tables-and-lists"
  | "floats"
  | "packages"
  | "warnings";

export interface ExplainContext {
  /** The compile ran on Polemic's server, not on this computer. */
  cloud: boolean;
}

type Rule = (
  message: string,
  issue: CompileIssue,
  ctx: ExplainContext,
) => Explanation | null;

/** A rule for messages that match `pattern`. */
function on(
  pattern: RegExp,
  explain: (
    match: RegExpExecArray,
    issue: CompileIssue,
    ctx: ExplainContext,
  ) => Explanation | null,
): Rule {
  return (message, issue, ctx) => {
    const match = pattern.exec(message);
    return match ? explain(match, issue, ctx) : null;
  };
}

/**
 * The command TeX stopped at: the last token of what it was reading
 * (`<argument> \foo`, `\mycmd ->\frrac`) or, at the top level, of the
 * source line up to the error (`l.12 \frrac`).
 */
function stoppedAtCommand(issue: CompileIssue): string | null {
  const source = issue.reading ?? issue.detail[0]?.replace(/^l\.\d+ ?/, "") ?? "";
  const match = /\\([A-Za-z@_:]+|[^A-Za-z\s])\s*$/.exec(source);
  return match ? `\\${match[1]}` : null;
}

/** A command of a class's or package's own, which the reader never typed. */
const isInternal = (command: string) => /[@_:]/.test(command);

const ENGINE_HELP = t(
  "A package or class it loads doesn't work with the current TeX engine. Choose another one under TeX engine in Document settings.",
);

/** The engine a message asks for, as it reads in a title. */
function engineAskedFor(message: string): string | null {
  const xe = /Xe(La)?TeX/i.test(message);
  const lua = /Lua(\(HB\)|HB)?(\(La\)|La)?TeX/i.test(message);
  if (!xe && !lua) return null;
  // A message that also names pdfTeX may be about what works there.
  if (/pdf(La)?TeX/i.test(message) && !/cannot be run with pdftex/i.test(message)) {
    return null;
  }
  const asks =
    /\brequires?\b|\bis required\b|\bneeds?\b|\bmust\b|\bonly\b|\bplease use\b|\bprecisa\b|cannot be run with pdftex/i.test(
      message,
    );
  if (!asks) return null;
  if (xe && lua) return t("XeLaTeX or LuaLaTeX");
  return xe ? "XeLaTeX" : "LuaLaTeX";
}

const BOOKMARK_HELP = t(
  "Math or a command in a heading is left out of the bookmark. Give a plain version with \\texorpdfstring{…}{plain text}.",
);
const BOOKMARK_MANY = t("parts of headings that PDF bookmarks can't show");

/** Characters that show as nothing, and what to do about each. */
const INVISIBLE: Record<string, [string, string]> = {
  "00A0": [
    t("a non-breaking space"),
    t("Replace it with ~ or a normal space. It often comes along when you paste text."),
  ],
  "200B": [
    t("a zero-width space"),
    t("Delete it. It is invisible and often comes along when you paste text."),
  ],
  "202F": [
    t("a narrow non-breaking space"),
    t(
      "Replace it with \\, or a normal space. It often comes along when you paste text.",
    ),
  ],
  "2009": [
    t("a thin space"),
    t(
      "Replace it with \\, or a normal space. It often comes along when you paste text.",
    ),
  ],
};

const IMAGE = /\.(png|jpe?g|pdf|eps|svg|gif|bmp|tiff?)$/i;

function missingFile(file: string, image: boolean, ctx: ExplainContext): Explanation {
  const kind = /\.sty$/i.test(file)
    ? t("Package")
    : /\.cls$/i.test(file)
      ? t("Class")
      : null;
  if (kind) {
    const name = file.replace(/\.(sty|cls)$/i, "");
    return {
      title: t("{kind} {name} not found", { kind, name }),
      help: ctx.cloud
        ? t(
            "It isn't in the project or in TeX Live. Check the name, or add its files to the project.",
          )
        : t(
            "It isn't in the project or in your TeX distribution. Check the name, or install it with your TeX distribution.",
          ),
      action: { kind: "ctan", name },
    };
  }
  if (image || IMAGE.test(file)) {
    return {
      title: t("Image {file} not found", { file }),
      help: t("Check the path and the file name, including capitals."),
    };
  }
  return {
    title: t("File {file} not found", { file }),
    help: t("Check the path and the file name, including capitals."),
  };
}

/** The catalog, in the sections of the guide to LaTeX errors. */
const SECTIONS: { topic: Topic; rules: Rule[] }[] = [
  {
    topic: "commands",
    rules: [
      on(/^Undefined control sequence\.$/, (_, issue) => {
        const command = stoppedAtCommand(issue);
        return {
          title: command
            ? t("Unknown command {command}", { command })
            : t("Unknown command"),
          help: command?.includes("@")
            ? t(
                "It is an internal command of a class or package. Check that the package it belongs to is loaded.",
              )
            : t(
                "Check the spelling. If a package defines it, load that package in the preamble.",
              ),
        };
      }),
      on(/^LaTeX Error: Environment (\S+) undefined\./, (m) => ({
        title: t("Unknown environment {environment}", { environment: m[1] }),
        help: t(
          "Check the spelling. If a package defines it, load that package in the preamble.",
        ),
      })),
      on(
        /^LaTeX Error: \\begin\{(\S+?)\} on input line (\d+) ended by \\end\{(\S+?)\}/,
        (m) => ({
          title: t("\\begin{{opened}} is closed by \\end{{closed}}", {
            opened: m[1],
            closed: m[3],
          }),
          help: t(
            "The environment opened on line {line} is closed by the wrong \\end, or an environment inside it is still open.",
            { line: m[2] },
          ),
        }),
      ),
      on(/^LaTeX Error: Command (\\\S+) already defined\./, (m) => {
        const counter = /^\\c@(.+)$/.exec(m[1]);
        if (counter) {
          return {
            title: t("The counter {counter} is defined twice", { counter: counter[1] }),
            help: t(
              "Two \\newtheorem or \\newcounter lines use this name, or a package already defines it. Remove one, or pick another name.",
            ),
          };
        }
        return {
          title: t("{command} is already defined", { command: m[1] }),
          help: isInternal(m[1])
            ? t(
                "It is an internal command of a class or package, so two packages probably clash. Check the packages loaded around this line.",
              )
            : t(
                "A package or an earlier \\newcommand defines it. Use \\renewcommand to replace it, or pick another name.",
              ),
        };
      }),
      on(/^LaTeX Error: Command (\\\S+) undefined\./, (m) => ({
        title: t("{command} isn't defined yet", { command: m[1] }),
        help: t(
          "\\renewcommand changes a command that exists. Use \\newcommand to define a new one.",
        ),
      })),
      on(/^LaTeX Error: Can be used only in preamble\./, () => ({
        title: t("This command belongs in the preamble"),
        help: t(
          "Move it before \\begin{document}. \\usepackage and similar setup commands go there.",
        ),
      })),
      on(/^LaTeX Error: Missing \\begin\{document\}\./, () => ({
        title: t("Text before \\begin{document}"),
        help: t(
          "Something in the preamble prints text, often a stray character or a misspelled command. If this file is only a part of the document, set the right file as main file.",
        ),
      })),
      on(/^LaTeX Error: Two \\documentclass or \\documentstyle commands\./, () => ({
        title: t("\\documentclass appears twice"),
        help: t(
          "A file you \\input or \\include has its own \\documentclass. Remove it there, or load that file with the subfiles package.",
        ),
      })),
      on(/^LaTeX Error: Loading a class or package in a group\./, () => ({
        title: t("A package is loaded inside a group"),
        help: t(
          "\\usepackage and \\documentclass can't sit inside braces or an environment. Move them to the top level of the preamble.",
        ),
      })),
      on(/^LaTeX Error: No counter '([^']+)' defined\./, (m) => ({
        title: t("No counter {counter}", { counter: m[1] }),
        help: t("Check the name, or define the counter with \\newcounter."),
      })),
      on(/^LaTeX Error: Counter too large\./, () => ({
        title: t("A counter is too large to print"),
        help: t(
          "Letters stop at 26 and footnote symbols at 9. Number this counter with \\arabic instead, or reset it sooner.",
        ),
      })),
      on(/^Emergency stop \(job aborted, no legal \\end found\)/, () => ({
        title: t("The document has no \\end{document}"),
        help: t(
          "TeX reached the end of the main file without it. Add it, or set the right file as main file if this one is only a part of the document.",
        ),
      })),
    ],
  },
  {
    topic: "files",
    rules: [
      on(
        /^Package (?:pdftex|luatex|xetex|dvipdfmx)\.def Error: File [`']([^`']+)' not found/,
        (m, _, ctx) => missingFile(m[1], true, ctx),
      ),
      on(/^Unable to load picture or PDF file [`']([^`']+)'\./, (m, _, ctx) =>
        missingFile(m[1], true, ctx),
      ),
      on(/^Package svg Error: File [`']([^`']+)' is missing\./, (m, _, ctx) =>
        missingFile(m[1], true, ctx),
      ),
      on(/^LaTeX Error: File [`']([^`']+)' not found\./, (m, _, ctx) =>
        missingFile(m[1], false, ctx),
      ),
      on(/^I can't find file [`']([^`']+)'\./, (m, _, ctx) =>
        missingFile(m[1], false, ctx),
      ),
      on(/^LaTeX Error: Unknown graphics extension: (\.\S+?)\.$/, (m) => ({
        title: t("Images of type {type} aren't supported", { type: m[1] }),
        help: t("Use a PDF, PNG or JPG file instead."),
      })),
      on(/^I can't write on file [`']([^`']+)'\./, (m) => ({
        title: t("TeX can't write the file {file}", { file: m[1] }),
        help: t(
          "A compile only writes inside the project's build folder. A package that writes somewhere else, or to a folder that doesn't exist, stops here.",
        ),
      })),
    ],
  },
  {
    topic: "engine-and-fonts",
    rules: [
      on(/fontspec Error: The font "([^"]+)" cannot be found/, (m, _, ctx) => ({
        title: t("The font {font} can't be found", { font: m[1] }),
        help: ctx.cloud
          ? t(
              "Polemic's server has TeX Live's fonts, not the ones installed on this computer. Put the font file in the project and load it by file name.",
            )
          : t(
              "It isn't installed on this computer. Check the name, or put the font file in the project and load it by file name.",
            ),
      })),
      on(/CTeX fontset [`'][^`']+' is unavailable in current mode/, () => ({
        title: t("This document needs XeLaTeX or LuaLaTeX"),
        help: ENGINE_HELP,
        action: { kind: "engine", engines: ["xelatex", "lualatex"] },
      })),
      on(/^LaTeX Error: Unicode character (.+?) \(U\+([0-9A-F]+)\)/, (m) => {
        const invisible = INVISIBLE[m[2]];
        if (invisible) {
          return {
            title: t("pdfLaTeX can't print {character} (U+{code})", {
              character: invisible[0],
              code: m[2],
            }),
            help: invisible[1],
          };
        }
        return {
          title: t("pdfLaTeX can't print {character} (U+{code})", {
            character: m[1],
            code: m[2],
          }),
          help: t(
            "Compile with XeLaTeX or LuaLaTeX (TeX engine in Document settings), or replace the character with a LaTeX command.",
          ),
          action: { kind: "engine", engines: ["xelatex", "lualatex"] },
        };
      }),
      on(/Invalid UTF-8 byte/, () => ({
        title: t("The file isn't saved as UTF-8"),
        help: t(
          "It has characters in another encoding, such as Latin-1. Save the file as UTF-8.",
        ),
      })),
      on(/^LaTeX Error: Command (\\\S+) unavailable in encoding (\S+?)\./, (m) => ({
        title: t("{character} isn't available in the font encoding {encoding}", {
          character: m[1],
          encoding: m[2],
        }),
        help: t(
          "The font encoding in use has no such character. For text in another script, load its font encoding, or compile with XeLaTeX or LuaLaTeX.",
        ),
      })),
      on(
        /^Font \S+?="([^":]+)[^"]*" at [\d.]+pt not loadable: Metric \(TFM\) file or installed font not found/,
        (m, _, ctx) => ({
          title: t("The font {font} can't be found", { font: m[1] }),
          help: ctx.cloud
            ? t(
                "Polemic's server has TeX Live's fonts, not the ones installed on this computer. Put the font file in the project and load it by file name.",
              )
            : t(
                "It isn't installed on this computer. Check the name, or put the font file in the project and load it by file name.",
              ),
        }),
      ),
      on(/^LaTeX Error: This file needs format [`'](\S+?)'/, (m) => ({
        title: t("This class is written for {replace}", {
          replace: m[1].replace(/2e$/, ""),
        }),
        help: t(
          "Polemic compiles with pdfLaTeX, XeLaTeX or LuaLaTeX. Use a class made for one of them.",
        ),
      })),
      // As errors only: a warning that names shell escape or an engine is
      // about one feature that was skipped, and says so itself.
      on(/shell[- ]escape/i, (_, issue) =>
        issue.severity === "error"
          ? {
              title: t("This package needs shell escape"),
              help: t(
                "Polemic compiles without shell escape, so packages that run other programs (minted, the TikZ externalization library) don't work. The listings package highlights code without it.",
              ),
            }
          : null,
      ),
      (message, issue) => {
        const engine = issue.severity === "error" ? engineAskedFor(message) : null;
        return engine
          ? {
              title: t("This document needs {engine}", { engine }),
              help: ENGINE_HELP,
              action: {
                kind: "engine",
                engines: [
                  ...(engine.includes("XeLaTeX") ? (["xelatex"] as const) : []),
                  ...(engine.includes("LuaLaTeX") ? (["lualatex"] as const) : []),
                ],
              },
            }
          : null;
      },
    ],
  },
  {
    topic: "math",
    rules: [
      on(/^Missing \$ inserted\.$/, () => ({
        title: t("Math used outside math mode"),
        help: t(
          "A character such as _ or ^, or a math command, appears in text. Put the math between $…$, or write \\_ for a literal underscore. A blank line inside math also causes this.",
        ),
      })),
      on(/^Extra \}, or forgotten \$\.$/, () => ({
        title: t("A } too many, or a missing $"),
        help: t(
          "Check that the braces on this line pair up and that math opened with $ is also closed with $.",
        ),
      })),
      on(/^Extra \}, or forgotten \\endgroup\.$/, () => ({
        title: t("A } too many, or an environment that isn't closed"),
        help: t(
          "Check that the braces on this line pair up and that every \\begin before it has its \\end.",
        ),
      })),
      on(/^Limit controls must follow a math operator\.$/, () => ({
        title: t("\\limits after something that isn't a math operator"),
        help: t(
          "\\limits and \\nolimits only work right after an operator such as \\sum or \\int. Define your own operator with \\DeclareMathOperator*.",
        ),
      })),
      on(/^Display math should end with \$\$\.$/, () => ({
        title: t("Display math isn't closed"),
        help: t(
          "Math opened with $$ or \\[ needs its closing $$ or \\] before the text goes on.",
        ),
      })),
      on(/^LaTeX Error: Bad math environment delimiter\./, () => ({
        title: t("Math delimiters don't pair up"),
        help: t(
          "\\[ needs \\], and \\( needs \\). One of them is missing, or sits inside other math.",
        ),
      })),
      on(/^Double (superscript|subscript)\.$/, (m) => ({
        title: t("Two {symbol}s in a row", { symbol: m[1] }),
        help:
          m[1] === "superscript"
            ? t("Group them with braces: x^{a^b} or {x^a}^b.")
            : t("Group them with braces: x_{a_b} or {x_a}_b."),
      })),
      on(/^Missing \\right\. inserted\.$/, () => ({
        title: t("\\left without a matching \\right"),
        help: t(
          "Each \\left needs a \\right in the same formula and on the same line of an aligned equation. Use \\right. for an invisible one.",
        ),
      })),
      on(/^Extra \\right\.$/, () => ({
        title: t("\\right without a matching \\left"),
        help: t(
          "Each \\right needs a \\left before it in the same formula. Use \\left. for an invisible one.",
        ),
      })),
      on(/^LaTeX Error: (\\\S+) allowed only in math mode\./, (m) => ({
        title: t("{command} only works in math mode", { command: m[1] }),
        help: t("Put it between $…$ or inside an equation."),
      })),
      on(/^LaTeX Error: Command (\\\S+) invalid in math mode\./, (m) => ({
        title: t("{command} doesn't work in math mode", { command: m[1] }),
        help: t("For text inside math, use \\text{…} from amsmath or \\mathrm{…}."),
      })),
    ],
  },
  {
    topic: "braces",
    rules: [
      on(/^Too many \}'s\.$/, () => ({
        title: t("A } without a matching {"),
        help: t("Remove the extra }, or add the { it should close."),
      })),
      on(/^Missing ([{}]) inserted\.$/, (m) => ({
        title: t("A {symbol} is missing", { symbol: m[1] }),
        help: t(
          "TeX expected it here. Check that the braces before this point pair up.",
        ),
      })),
      on(/^Paragraph ended before (\\\S+) was complete\.$/, (m) =>
        isInternal(m[1])
          ? {
              title: t("An argument is never closed"),
              help: t(
                "A { on or before this line has no matching }, or there is a blank line inside an argument.",
              ),
            }
          : {
              title: t("The argument of {command} is never closed", { command: m[1] }),
              help: t(
                "A { after {command} has no matching }, or there is a blank line inside its argument.",
                { command: m[1] },
              ),
            },
      ),
      on(/^File ended while scanning (?:use|definition|text) of (\\\S+)\.$/, (m) =>
        isInternal(m[1])
          ? {
              title: t("The file ends inside an argument"),
              help: t("A { is never closed."),
            }
          : {
              title: t("The file ends inside {command}", { command: m[1] }),
              help: t("A { after {command} is never closed.", { command: m[1] }),
            },
      ),
      on(/^Argument of (\\\S+) has an extra \}\.$/, (m) => ({
        title: isInternal(m[1])
          ? t("A } too many in an argument")
          : t("A } too many in the argument of {command}", { command: m[1] }),
        help: t(
          "Check the braces on this line. A command inside a caption or heading can also cause this: put \\protect before it.",
        ),
      })),
      on(/^Use of (\\\S+) doesn't match its definition\.$/, (m) => ({
        title: isInternal(m[1])
          ? t("A command is used in a way its definition doesn't allow")
          : t("{command} is used in a way its definition doesn't allow", {
              command: m[1],
            }),
        help: t(
          "Check the arguments on this line. A command inside a caption or heading can also cause this: put \\protect before it.",
        ),
      })),
      on(/^Missing \\endcsname inserted\.$/, () => ({
        title: t("A command where a name is expected"),
        help: t(
          "Names of labels, citations, counters and environments can't contain commands. Check the argument on this line.",
        ),
      })),
      on(/^Missing number, treated as zero\.$/, () => ({
        title: t("A number is missing"),
        help: t(
          "A command on this line expects a number or a length, as in \\vspace{1cm}. Text in square brackets right after \\\\ is also read as a length.",
        ),
      })),
      on(/^Illegal unit of measure \(pt inserted\)\.$/, () => ({
        title: t("A length has no unit"),
        help: t(
          "Lengths need a unit such as pt, cm or em: \\vspace{1cm}, not \\vspace{1}.",
        ),
      })),
      on(/^Dimension too large\.$/, () => ({
        title: t("A length is too large for TeX"),
        help: t(
          "TeX can't work with lengths over about 5.7 m. A plot with very large coordinates or an image scaled without limits often causes this.",
        ),
      })),
      on(/^TeX capacity exceeded, sorry \[([^\]=]+)/, (m) => ({
        title: t("TeX ran out of memory"),
        help: t(
          "It filled its {what}. This is usually a command that calls itself without end: check recent \\newcommand definitions.",
          { what: m[1].trim() },
        ),
      })),
      on(/^You can't use [`']macro parameter character #' in/, () => ({
        title: t("# used in text"),
        help: t("Write \\# for a literal #."),
      })),
    ],
  },
  {
    topic: "tables-and-lists",
    rules: [
      on(/^Extra alignment tab has been changed to \\cr\.$/, () => ({
        title: t("Too many & in a table row"),
        help: t(
          "This row has more columns than the table declares. Add a column to the column specification, or remove an &.",
        ),
      })),
      on(/^Misplaced alignment tab character &\.$/, () => ({
        title: t("& used outside a table"),
        help: t(
          "Write \\& for a literal ampersand. Inside a table or aligned math, check that the environment is open.",
        ),
      })),
      on(/^Misplaced \\noalign\.$/, () => ({
        title: t("A table rule in the wrong place"),
        help: t(
          "\\hline, \\toprule and similar rules go at the start of a row, right after \\\\.",
        ),
      })),
      on(/^LaTeX Error: (?:Illegal character|Missing p-arg) in array arg\./, () => ({
        title: t("The column specification of a table is wrong"),
        help: t(
          "Check the {…} after \\begin{tabular}: it takes letters such as l, c and r, and p{width}.",
        ),
      })),
      on(/^LaTeX Error: There's no line here to end\./, () => ({
        title: t("\\\\ with no line to end"),
        help: t(
          "\\\\ can't start a paragraph or follow a blank line. Remove it, or use \\vspace for extra space.",
        ),
      })),
      on(/^LaTeX Error: Something's wrong--perhaps a missing \\item\./, () => ({
        title: t("A list without \\item"),
        help: t(
          "Text in itemize, enumerate or description needs \\item before it. An empty bibliography also causes this.",
        ),
      })),
      on(/^LaTeX Error: Lonely \\item--perhaps a missing list environment\./, () => ({
        title: t("\\item outside a list"),
        help: t("Put it inside itemize, enumerate or description."),
      })),
      on(/^LaTeX Error: \\verb ended by end of line\./, () => ({
        title: t("\\verb isn't closed on its line"),
        help: t(
          "\\verb needs the same character at both ends, on one line: \\verb|text|.",
        ),
      })),
    ],
  },
  {
    topic: "floats",
    rules: [
      on(/^LaTeX Error: Unknown float option [`']H'\./, () => ({
        title: t("The float option H needs the float package"),
        help: t("Add \\usepackage{float} to the preamble, or use [htbp]."),
      })),
      on(/^LaTeX Error: Not in outer par mode\./, () => ({
        title: t("A figure or table inside a box"),
        help: t(
          "figure and table can't go inside a minipage, a \\parbox or another figure or table.",
        ),
      })),
      on(/^LaTeX Error: Too many unprocessed floats\./, () => ({
        title: t("Too many figures are waiting for a place"),
        help: t(
          "Add \\clearpage to place the figures and tables so far, or loosen their placement with [htbp].",
        ),
      })),
    ],
  },
  {
    topic: "packages",
    rules: [
      on(/^LaTeX Error: Option clash for package (\S+?)\./, (m) => ({
        title: t("The package {package} is loaded twice with different options", {
          package: m[1],
        }),
        help: t(
          "Give all options the first time it is loaded. If the class loads it, pass them with \\PassOptionsToPackage before \\documentclass.",
        ),
      })),
      on(
        /^LaTeX Error: Unknown option [`']([^`']+)' for package [`']?([^`'.\s]+)/,
        (m) => ({
          title: t("The package {package} has no option {option}", {
            package: m[2],
            option: m[1],
          }),
          help: t("Check the spelling of the option in \\usepackage."),
        }),
      ),
      on(/^Package babel Error: Unknown option [`']([^`']+)'/, (m) => ({
        title: t("babel doesn't know the language {language}", { language: m[1] }),
        help: t(
          "Check the language name in the babel options. Some old names were replaced, such as frenchb by french.",
        ),
      })),
      on(/^Package xcolor Error: Undefined color [`']([^`']+)'/, (m) => ({
        title: t("Unknown color {color}", { color: m[1] }),
        help: t(
          "Define it with \\definecolor, or load xcolor with an option that provides it, such as dvipsnames.",
        ),
      })),
      on(/^Package pgfkeys Error: I do not know the key '([^']+)'/, (m) => ({
        title: t("Unknown option {replace}", {
          replace: m[1].replace(/^\/(tikz|pgf|pgfplots)\//, ""),
        }),
        help: t(
          "Check the spelling. Some TikZ options need a library: load it with \\usetikzlibrary.",
        ),
      })),
      on(
        /^Package tikz Error: Giving up on this path\. Did you forget a semicolon\?/,
        () => ({
          title: t("A TikZ path isn't finished"),
          help: t(
            "Each \\draw, \\node and \\path ends with a semicolon. Check the one on this line, and the syntax before it.",
          ),
        }),
      ),
      on(/^Package keyval Error: (\S+) undefined\./, (m) => ({
        title: t("Unknown option {option}", { option: m[1] }),
        help: t(
          "The command or package on this line has no option with this name. Check the spelling.",
        ),
      })),
      on(
        /^Package natbib Error: Bibliography not compatible with author-year citations\./,
        () => ({
          title: t("The bibliography style doesn't support author-year citations"),
          help: t(
            "Use a style made for natbib, such as plainnat, or load natbib with the numbers option.",
          ),
        }),
      ),
    ],
  },
  {
    topic: "warnings",
    rules: [
      on(
        /^LaTeX Warning: (?:Hyper r|R)eference [`']([^`']+)' on page \d+ undefined/,
        (m) => ({
          title: t("No label {label} for this reference", { label: m[1] }),
          help: t(
            "Check the spelling, or add \\label{…} where the reference should point.",
          ),
          many: t("references without a label"),
        }),
      ),
      on(
        /^(?:LaTeX|Package natbib) Warning: Citation [`']([^`']+)' (?:on page \d+ )?undefined/,
        (m) => ({
          title: t("No bibliography entry {key} for this citation", { key: m[1] }),
          help: t("Check the key, or add the entry to your .bib file."),
          many: t("citations without a bibliography entry"),
        }),
      ),
      on(/^LaTeX Warning: Label [`']([^`']+)' multiply defined/, (m) => ({
        title: t("The label {label} is used more than once", { label: m[1] }),
        help: t(
          "References to it point at one of them only. Give each \\label its own name.",
        ),
        many: t("labels used more than once"),
      })),
      on(/^Package natbib Warning: Citation [`']([^`']+)' multiply defined/, (m) => ({
        title: t("The citation key {key} is defined more than once", { key: m[1] }),
        help: t("Two bibliography entries share this key. Rename one of them."),
        many: t("citation keys defined more than once"),
      })),
      on(
        /^Package glossaries\S* Warning: Glossary entry [`']([^`']+)' has not been defined/,
        (m) => ({
          title: t("No glossary entry {entry}", { entry: m[1] }),
          help: t("Check the label, or define the entry."),
          many: t("glossary entries that aren't defined"),
        }),
      ),
      on(/^LaTeX Warning: File [`']([^`']+)' not found/, (m, _, ctx) => ({
        ...missingFile(m[1], false, ctx),
        many: t("files not found"),
      })),
      on(/^LaTeX Warning: Float too large for page by ([\d.]+)pt/, (m) => ({
        title: t("A figure or table is {round} pt too tall for the page", {
          round: Math.round(Number(m[1])),
        }),
        help: t(
          "Make it smaller, for example with a smaller height for \\includegraphics.",
        ),
        many: t("figures or tables too tall for the page"),
      })),
      on(/^LaTeX Warning: Marginpar on page \d+ moved/, () => ({
        title: t("A margin note was moved"),
        help: t(
          "It would overlap the one before it, so it sits lower than the text it belongs to.",
        ),
        many: t("margin notes moved"),
      })),
      on(/^LaTeX Font Warning: Font shape [`'][^`']+' undefined/, () => ({
        title: t("A font variant is replaced by another"),
        help: t(
          "The font has no such weight or shape, for example bold small caps, so the PDF uses the closest one it has.",
        ),
        many: t("font variants replaced by another"),
      })),
      on(
        /^LaTeX Font Warning: Font shape [`'][^`']+' in size <[\d.]+> not available/,
        () => ({
          title: t("A font size is replaced by the closest one"),
          help: t(
            "The font comes in fixed sizes only. For any size, load a scalable font, for example with \\usepackage{lmodern}.",
          ),
          many: t("font sizes replaced by the closest one"),
        }),
      ),
      on(
        /^Package xeCJK Warning: CJKfamily .* does not contain glyph [`'](.+?)' \((U\+[0-9A-F]+)\)/,
        (m) => ({
          title: t("The font has no character {character} ({code})", {
            character: m[1],
            code: m[2],
          }),
          help: t("It is left out of the PDF. Use a font that has this character."),
          many: t("characters missing from the font"),
        }),
      ),
      on(/^Package hyperref Warning: Token not allowed in a PDF string/, () => ({
        title: t("A heading has something PDF bookmarks can't show"),
        help: BOOKMARK_HELP,
        many: BOOKMARK_MANY,
      })),
      on(
        /^Package hyperref Warning: Glyph not defined in PU encoding, removing [`'](.+?)'/,
        (m) => ({
          title: t("PDF bookmarks can't show {command}", { command: m[1] }),
          help: BOOKMARK_HELP,
          many: BOOKMARK_MANY,
        }),
      ),
    ],
  },
];

/** The issue in plain words, or null when TeX's message has to do. */
export function explainIssue(
  issue: CompileIssue,
  ctx: ExplainContext,
): Explanation | null {
  for (const { topic, rules } of SECTIONS) {
    for (const rule of rules) {
      const explanation = rule(issue.message, issue, ctx);
      if (explanation) return { ...explanation, topic };
    }
  }
  return null;
}
