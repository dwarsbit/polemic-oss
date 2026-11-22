// Wraps the strings a leftovers.mjs list names in t() calls: give it the
// list with the lines a person decided to keep as code taken out.
//
// node wrap.mjs <list>

import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const list = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
const byFile = new Map();
for (const entry of list) {
  const m = /^(.*?):(\d+): (.*)$/.exec(entry);
  if (!m) continue;
  const [, file, line, text] = m;
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push({ line: Number(line), text });
}

function placeholder(expr, used) {
  let base = "value";
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : "";
    const arg = expr.arguments[0];
    if (
      /^(String|Number|trim|join|toString|toLocaleString)$/.test(name) &&
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression)
    )
      base = callee.expression.text;
    else if (/^(String|Number)$/.test(name) && arg && ts.isIdentifier(arg))
      base = arg.text;
    else if (name) base = name;
  }
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}${i}`;
  used.add(name);
  return name;
}

let manual = 0;
for (const [file, entries] of byFile) {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  let usesT = false;
  const want = (node, text) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const i = entries.findIndex((e) => e.line === line && e.text === text);
    if (i < 0) return false;
    entries.splice(i, 1);
    return true;
  };
  const norm = (s) => s.replace(/\s+/g, " ").slice(0, 140);
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (want(node, norm(node.text))) {
        const call = `t(${JSON.stringify(node.text)})`;
        const inAttr = node.parent && ts.isJsxAttribute(node.parent);
        edits.push({
          start: node.getStart(sf),
          end: node.getEnd(),
          text: inAttr ? `{${call}}` : call,
        });
        usesT = true;
      }
    } else if (ts.isTemplateExpression(node)) {
      if (want(node, norm(node.getText(sf).slice(1, -1)))) {
        const nested = node.templateSpans.some((s) => {
          let bad = false;
          const v = (n) => {
            if (
              ts.isStringLiteral(n) ||
              ts.isTemplateLiteral(n) ||
              ts.isConditionalExpression(n)
            )
              bad = true;
            else ts.forEachChild(n, v);
          };
          v(s.expression);
          return bad;
        });
        if (nested) {
          console.log(
            `manual: ${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${node.getText(sf).slice(0, 120)}`,
          );
          manual++;
          return;
        }
        let message = node.head.text;
        const used = new Set();
        const values = [];
        for (const span of node.templateSpans) {
          const name = placeholder(span.expression, used);
          const text = span.expression.getText(sf);
          values.push(text === name ? name : `${name}: ${text}`);
          message += `{${name}}${span.literal.text}`;
        }
        edits.push({
          start: node.getStart(sf),
          end: node.getEnd(),
          text: `t(${JSON.stringify(message)}, { ${values.join(", ")} })`,
        });
        usesT = true;
        return;
      }
    } else if (ts.isJsxText(node)) {
      const trimmed = node.text.trim();
      if (trimmed && want(node, norm(trimmed))) {
        const start = node.getStart(sf) + node.text.indexOf(trimmed);
        edits.push({
          start,
          end: start + trimmed.length,
          text: `{t(${JSON.stringify(trimmed.replace(/\s+/g, " "))})}`,
        });
        usesT = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const e of entries) console.log(`not found: ${file}:${e.line}: ${e.text}`);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (usesT && !/import \{[^}]*\bt\b[^}]*\} from "@scholarkit\/i18n"/.test(out)) {
    const imports = sf.statements.filter(ts.isImportDeclaration);
    const at = imports.length
      ? out.indexOf("\n", imports[imports.length - 1].getEnd()) + 1
      : 0;
    out = `${out.slice(0, at)}import { t } from "@scholarkit/i18n";\n${out.slice(at)}`;
  }
  writeFileSync(file, out);
}
console.log(`${manual} left for a person`);
