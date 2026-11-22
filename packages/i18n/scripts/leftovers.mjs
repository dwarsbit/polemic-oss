// Lists string literals that read like interface text but aren't passed to
// t(), tn(), msg() or rich(): what a move into t() calls still has to look at.
//
// node leftovers.mjs <folder> [--skip <path part>]...

import { readFileSync } from "node:fs";
import ts from "typescript";
import { sourceFiles } from "./extract.mjs";

const I18N = new Set(["t", "tn", "msg", "rich"]);
const IGNORE_CALLS =
  /^(console\.\w+|invoke|fetch|querySelector\w*|getElementById|addEventListener|removeEventListener|require|import|describe|it|test|expect|RegExp|startsWith|endsWith|includes|indexOf|split|join|replace|replaceAll|match|matchAll|test|localStorage\.\w+|setItem|getItem|emit|listen|on|log|debug|warn|info|trace|captureMessage|cn|cva|clsx|Symbol|create\w*Context)$/;

export function prose(s) {
  if (
    /^(menu:\/\/|vis-|<svg|<path|data:|mailto:)/.test(s.trim()) ||
    /<path |<circle |<rect /.test(s)
  )
    return false;
  if (
    !/\s/.test(s.replace(/\$\{[^}]*\}/g, "x").trim()) &&
    !/^[A-Z][a-z]+(…)?$/.test(s.trim())
  )
    return false;
  const words = s.replace(/\$\{[^}]*\}|\{\w+\}/g, " ").match(/[A-Za-z][a-z']+/g) ?? [];
  if (words.length < 2)
    return /^[A-Z][a-z]+(…)?$/.test(s.trim()) && s.trim().length > 2;
  if (/^[a-z0-9-]+( [a-z0-9:-]+)*$/.test(s) && !/ /.test(s)) return false;
  if (/^(\.|#|\[|@|\/|https?:)/.test(s.trim())) return false;
  if (
    /(\d(px|rem)\b|var\(|\bflex\b|\bgrid\b|\brounded\b|\btext-\w|\bbg-|\bborder\b|\bitems-|\bjustify-)/.test(
      s,
    )
  )
    return false;
  return true;
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e))
    return `${e.expression.getText()}.${e.name.text}`.replace(/^.*\.(\w+\.\w+)$/, "$1");
  return "";
}

export function leftoversIn(source, fileName) {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = [];
  const visit = (node, inI18n) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (ts.isIdentifier(node.expression) && I18N.has(node.expression.text))
        inI18n = true;
      const last = name.split(".").pop();
      if (IGNORE_CALLS.test(name) || IGNORE_CALLS.test(last ?? "")) {
        // Strings passed straight to these calls are code, not text; look inside the rest.
        visit(node.expression, inI18n);
        for (const arg of node.arguments)
          if (
            !ts.isStringLiteral(arg) &&
            !ts.isNoSubstitutionTemplateLiteral(arg) &&
            !ts.isTemplateExpression(arg)
          )
            visit(arg, inI18n);
        return;
      }
    }
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isTypeNode(node) ||
      ts.isCaseClause(node)
    )
      return;
    if (
      ts.isBinaryExpression(node) &&
      /^(===|!==|==|!=)$/.test(node.operatorToken.getText())
    )
      return;
    if (
      ts.isJsxAttribute(node) &&
      /^(className|class|id|key|type|variant|size|href|src|role|name|value|d|viewBox|style|data-.*)$/.test(
        node.name.getText(),
      )
    )
      return;
    if (ts.isNewExpression(node) && node.expression.getText() === "RegExp") return;
    const literal =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? node.getText().slice(1, -1)
          : ts.isJsxText(node)
            ? node.text.trim()
            : undefined;
    if (
      literal !== undefined &&
      !inI18n &&
      !(
        node.parent &&
        ts.isPropertyAssignment(node.parent) &&
        node.parent.name === node
      )
    ) {
      if (prose(literal))
        out.push({
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          text: literal.replace(/\s+/g, " ").slice(0, 140),
        });
      if (ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, (c) => visit(c, inI18n));
  };
  visit(sf, false);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const skip = [];
  const dirs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--skip") skip.push(args[++i]);
    else dirs.push(args[i]);
  }
  let total = 0;
  for (const dir of dirs)
    for (const file of sourceFiles(dir)) {
      if (skip.some((s) => file.includes(s))) continue;
      for (const l of leftoversIn(readFileSync(file, "utf8"), file)) {
        console.log(`${file}:${l.line}: ${l.text}`);
        total++;
      }
    }
  console.error(`${total} strings`);
}
