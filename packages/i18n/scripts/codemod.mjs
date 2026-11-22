// One-off helper for moving an app's interface text into t() calls. It
// rewrites, in place:
//
// - JSX text, with simple {expressions} as placeholders and inline elements
//   such as <code>…</code> as numbered tags (rich());
// - string attributes such as title, label, placeholder and aria-label;
// - string properties such as label, description and title in object literals;
// - the message argument of setters such as setError() and flash().
//
// It prints what it couldn't do (a local `t` in scope, text split by an
// element) for a person to finish. Review the diff: it guesses, and leaves
// strings that aren't text alone only where its rules say so.
//
// node codemod.mjs <file or folder>... [--skip <path part>]...

import { readFileSync, writeFileSync, statSync } from "node:fs";
import ts from "typescript";
import { sourceFiles } from "./extract.mjs";

const TEXT_NAME =
  /(label|title|text|placeholder|description|message|hint|tooltip|caption|heading|intro|summary|detail|empty|alt|keywords|subtitle|blurb|note|prompt|action)$/i;
const NOT_TEXT_NAME =
  /^(className|id|key|type|variant|size|href|src|role|name|value|side|align|mode|lang|rel|target|method|kind|icon|tone|testId|data-.*)$/;
const SETTER =
  /^(set\w*(Error|Message|Notice|Note|Status|Hint|Warning|Label|Text)|flash|toast|notify|refuse|announce|showError)$/;
const CODE_TAGS = new Set(["code", "kbd", "pre", "samp", "var", "Kbd", "Code", "math"]);

const hasWords = (s) => /[A-Za-z]{2,}/.test(s);
const looksLikeText = (s) =>
  hasWords(s) && (/\s/.test(s.trim()) || /^[A-Z]/.test(s) || /…$/.test(s));

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  times: "×",
  middot: "·",
  rarr: "→",
  larr: "←",
};
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#")
      return String.fromCodePoint(
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10),
      );
    return ENTITIES[e] ?? m;
  });
}

/** JSX text as React renders it: lines trimmed, blank lines dropped, joined by spaces. */
function jsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  if (lines.length === 1) return decode(raw);
  const kept = [];
  lines.forEach((line, i) => {
    let l = line;
    if (i !== 0) l = l.replace(/^[ \t]+/, "");
    if (i !== lines.length - 1) l = l.replace(/[ \t]+$/, "");
    if (l) kept.push(l);
  });
  return decode(kept.join(" "));
}

const quote = (s) => JSON.stringify(s);

function placeholderName(expr, used) {
  let base = "value";
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression))
    base = expr.expression.text;
  else if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression))
    base = expr.expression.name.text;
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}${i}`;
  used.add(name);
  return name;
}

function containsJsx(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n))
      found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function tagName(el) {
  const tag = ts.isJsxElement(el) ? el.openingElement.tagName : el.tagName;
  return tag.getText();
}

/** Is `t` declared between `node` and the file (a parameter or variable)? */
function shadowed(node) {
  for (let n = node.parent; n; n = n.parent) {
    const params = n.parameters;
    if (params && params.some((p) => p.name.getText() === "t")) return true;
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isForStatement(n)) {
      let found = false;
      const visit = (c) => {
        if (found || c === n) return;
        if (
          ts.isVariableDeclaration(c) &&
          ts.isIdentifier(c.name) &&
          c.name.text === "t"
        )
          found = true;
        if (ts.isFunctionLike(c) || ts.isBlock(c)) return;
        ts.forEachChild(c, visit);
      };
      ts.forEachChild(n, visit);
      if (found && !ts.isSourceFile(n)) return true;
    }
  }
  return false;
}

/** A template literal as a message with placeholders, or undefined if it has none to give. */
function templateMessage(tpl, sf) {
  if (ts.isNoSubstitutionTemplateLiteral(tpl)) return { message: tpl.text, values: "" };
  let message = tpl.head.text;
  const used = new Set();
  const values = [];
  for (const span of tpl.templateSpans) {
    if (containsJsx(span.expression)) return undefined;
    const name = placeholderName(span.expression, used);
    const text = span.expression.getText(sf);
    values.push(text === name ? name : `${name}: ${text}`);
    message += `{${name}}` + span.literal.text;
  }
  return { message, values: values.length ? `, { ${values.join(", ")} }` : "" };
}

export function transform(source, fileName) {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  const notes = [];
  const used = { t: false, rich: false };
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const consumed = new Set();

  const callFor = (node, message, values = "") => {
    if (shadowed(node)) {
      notes.push(
        `${fileName}:${line(node)}: a local t hides the import; left ${quote(message)}`,
      );
      return undefined;
    }
    used.t = true;
    return `t(${quote(message)}${values})`;
  };

  // A string-ish expression (literal or template) as a t() call.
  const exprCall = (expr) => {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      if (!looksLikeText(expr.text)) return undefined;
      return callFor(expr, expr.text);
    }
    if (ts.isTemplateExpression(expr)) {
      const m = templateMessage(expr, sf);
      if (!m || !looksLikeText(m.message.replace(/\{\w+\}/g, ""))) return undefined;
      return callFor(expr, m.message, m.values);
    }
    return undefined;
  };

  const isInlineTag = (child) =>
    ts.isJsxElement(child) &&
    child.children.length > 0 &&
    child.children.every(
      (c) =>
        ts.isJsxText(c) ||
        (ts.isJsxExpression(c) && c.expression && ts.isStringLiteral(c.expression)),
    );

  const isSimpleExpr = (child) =>
    ts.isJsxExpression(child) &&
    child.expression &&
    !containsJsx(child.expression) &&
    !ts.isConditionalExpression(child.expression) &&
    !ts.isBinaryExpression(child.expression) &&
    !(
      ts.isCallExpression(child.expression) &&
      ts.isIdentifier(child.expression.expression) &&
      ["t", "tn", "rich"].includes(child.expression.expression.text)
    );

  const isWordy = (child) => ts.isJsxText(child) && hasWords(jsxText(child.text));

  function handleChildren(children) {
    // Split into runs of text, simple expressions and inline tags.
    let run = [];
    const flush = () => {
      // Whitespace-only text at the ends belongs to the layout, not the message.
      const blank = (c) => ts.isJsxText(c) && jsxText(c.text).trim() === "";
      while (run.length && blank(run[0])) run.shift();
      while (run.length && blank(run[run.length - 1])) run.pop();
      if (run.some(isWordy)) emitRun(run);
      run = [];
    };
    for (const child of children) {
      if (ts.isJsxText(child)) {
        // Text with a newline and nothing else renders nothing: skip it, the run goes on.
        if (jsxText(child.text) === "" && /\n/.test(child.text)) {
          if (run.length) run.push(child);
          continue;
        }
        run.push(child);
      } else if (isSimpleExpr(child) || isInlineTag(child)) run.push(child);
      else flush();
    }
    flush();
  }

  function emitRun(run) {
    const first = run[0];
    const parent = first.parent;
    if (ts.isJsxElement(parent) && CODE_TAGS.has(tagName(parent))) return;
    let message = "";
    const valueNames = new Set();
    const values = [];
    const parts = [];
    for (const child of run) {
      if (ts.isJsxText(child)) message += jsxText(child.text);
      else if (ts.isJsxExpression(child)) {
        const e = child.expression;
        if (ts.isStringLiteral(e)) message += e.text;
        else {
          const name = placeholderName(e, valueNames);
          const text = e.getText(sf);
          values.push(text === name ? name : `${name}: ${text}`);
          message += `{${name}}`;
        }
      } else {
        const open = child.openingElement.getText(sf);
        const close = child.closingElement.getText(sf);
        const inner = child.children
          .map((c) => (ts.isJsxText(c) ? jsxText(c.text) : c.expression.text))
          .join("");
        message += `<${parts.length}>${inner}</${parts.length}>`;
        parts.push(`(c) => ${open}{c}${close}`);
        consumed.add(child);
      }
    }
    const lead = /^\s/.test(message) ? '{" "}' : "";
    const trail = /\s$/.test(message) ? '{" "}' : "";
    message = message.trim().replace(/[ \t]+/g, " ");
    if (!hasWords(message.replace(/<\/?\d+>|\{\w+\}/g, ""))) return;
    if (shadowed(first)) {
      notes.push(
        `${fileName}:${line(first)}: a local t hides the import; left ${quote(message)}`,
      );
      return;
    }
    const valueArg = values.length ? `{ ${values.join(", ")} }` : "";
    let call;
    if (parts.length) {
      used.rich = true;
      call = `rich(${quote(message)}, [${parts.join(", ")}]${valueArg ? `, ${valueArg}` : ""})`;
    } else {
      used.t = true;
      call = `t(${quote(message)}${valueArg ? `, ${valueArg}` : ""})`;
    }
    edits.push({
      start: ts.isJsxText(first) ? first.pos : first.getStart(sf),
      end: run[run.length - 1].getEnd(),
      text: `${lead}{${call}}${trail}`,
    });
  }

  const visit = (node) => {
    if (consumed.has(node)) return;
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      if (!(ts.isJsxElement(node) && CODE_TAGS.has(tagName(node))))
        handleChildren(node.children);
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (TEXT_NAME.test(name) && !NOT_TEXT_NAME.test(name)) {
        const init = node.initializer;
        if (ts.isStringLiteral(init) && looksLikeText(init.text)) {
          const call = callFor(init, init.text);
          if (call)
            edits.push({
              start: init.getStart(sf),
              end: init.getEnd(),
              text: `{${call}}`,
            });
        } else if (ts.isJsxExpression(init) && init.expression) {
          const call = exprCall(init.expression);
          if (call)
            edits.push({
              start: init.expression.getStart(sf),
              end: init.expression.getEnd(),
              text: call,
            });
        }
      }
    } else if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ) {
      const name = node.name.text;
      if (TEXT_NAME.test(name) && !NOT_TEXT_NAME.test(name)) {
        const call = exprCall(node.initializer);
        if (call)
          edits.push({
            start: node.initializer.getStart(sf),
            end: node.initializer.getEnd(),
            text: call,
          });
      }
    } else if (ts.isCallExpression(node) && node.arguments.length) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      if (SETTER.test(name)) {
        const arg = node.arguments[0];
        const call = exprCall(arg);
        if (call)
          edits.push({ start: arg.getStart(sf), end: arg.getEnd(), text: call });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!edits.length) return { source, notes, changed: false };
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  let lastStart = Infinity;
  for (const e of edits) {
    if (e.end > lastStart) continue; // nested in an edit already made
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  out = addImports(out, sf, used);
  return { source: out, notes, changed: true };
}

function addImports(out, sf, used) {
  const lines = [];
  const has = (mod, name) =>
    new RegExp(
      `import \\{[^}]*\\b${name}\\b[^}]*\\} from "${mod.replace("/", "\\/")}"`,
    ).test(out);
  if (used.t && !has("@scholarkit/i18n", "t"))
    lines.push('import { t } from "@scholarkit/i18n";');
  if (used.rich && !has("@scholarkit/i18n/react", "rich"))
    lines.push('import { rich } from "@scholarkit/i18n/react";');
  if (!lines.length) return out;
  const imports = sf.statements.filter(ts.isImportDeclaration);
  const at = imports.length
    ? out.indexOf("\n", imports[imports.length - 1].getEnd()) + 1
    : 0;
  return out.slice(0, at) + lines.join("\n") + "\n" + out.slice(at);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const skip = [];
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--skip") skip.push(args[++i]);
    else targets.push(args[i]);
  }
  const files = targets.flatMap((p) =>
    statSync(p).isDirectory() ? sourceFiles(p) : [p],
  );
  let changed = 0;
  for (const file of files) {
    if (skip.some((s) => file.includes(s))) continue;
    const before = readFileSync(file, "utf8");
    const { source, notes, changed: did } = transform(before, file);
    for (const n of notes) console.log(n);
    if (did && source !== before) {
      writeFileSync(file, source);
      changed++;
    }
  }
  console.log(`Changed ${changed} files.`);
}
