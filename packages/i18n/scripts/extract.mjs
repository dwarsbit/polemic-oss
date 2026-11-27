// Collects the messages an app passes to t(), tn(), msg() and rich(), and keeps
// its catalogs in step: one JSON file per language in the locales folder,
// keyed by the English message. en.json lists the English itself (the source
// translators work from); every other file keeps its translations, gains the
// new messages untranslated ("") and drops the ones the code no longer uses.

import {
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const CALLS = new Set(["t", "msg", "rich", "tn"]);

/** Every .ts and .tsx file under `dir`, tests and catalogs left out, sorted. */
export function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === "node_modules" || entry.name === "locales") continue;
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (
        /\.tsx?$/.test(entry.name) &&
        !/\.(test|spec)\.tsx?$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      )
        out.push(path);
    }
  };
  walk(dir);
  return out;
}

function literal(node) {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)))
    return node.text;
  return undefined;
}

/**
 * The messages in one file's source, in order: { message, plural?: { one, other }, line }.
 */
export function messagesIn(source, fileName = "file.tsx") {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CALLS.has(node.expression.text)
    ) {
      const name = node.expression.text;
      const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (name === "tn") {
        const one = literal(node.arguments[1]);
        const other = literal(node.arguments[2]);
        if (one !== undefined && other !== undefined)
          found.push({ message: other, plural: { one, other }, line });
      } else {
        const message = literal(node.arguments[0]);
        if (message !== undefined) found.push({ message, line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * Every message under `srcDir` (a folder, or several: the app's own and those of
 * the shared packages it shows), first occurrence first.
 */
export function collect(srcDir) {
  const messages = new Map();
  const dirs = Array.isArray(srcDir) ? srcDir : [srcDir];
  for (const [dir, path] of dirs.flatMap((d) => sourceFiles(d).map((f) => [d, f]))) {
    for (const m of messagesIn(readFileSync(path, "utf8"), path)) {
      const where = `${relative(dir, path)}:${m.line}`;
      const seen = messages.get(m.message);
      if (seen) seen.where.push(where);
      else messages.set(m.message, { plural: m.plural, where: [where] });
    }
  }
  return messages;
}

// CLDR's order. Node's own order of the categories depends on its version (newer versions
// follow this one), and the catalogs must come out the same on every computer.
const PLURAL_ORDER = ["zero", "one", "two", "few", "many", "other"];

function pluralTemplate(language) {
  const forms = {};
  const categories = [
    ...new Intl.PluralRules(language).resolvedOptions().pluralCategories,
  ].sort((a, b) => PLURAL_ORDER.indexOf(a) - PLURAL_ORDER.indexOf(b));
  for (const category of categories) forms[category] = "";
  return forms;
}

/** The catalog for `language` given the messages and its current contents. */
export function updateCatalog(language, messages, current = {}) {
  const next = {};
  for (const [message, { plural }] of messages) {
    if (language === "en") {
      next[message] = plural ? { one: plural.one, other: plural.other } : message;
      continue;
    }
    const old = current[message];
    if (plural) {
      const forms = pluralTemplate(language);
      if (old && typeof old === "object")
        for (const k of Object.keys(forms)) forms[k] = old[k] ?? "";
      else if (typeof old === "string") forms.other = old;
      next[message] = forms;
    } else {
      next[message] = typeof old === "string" ? old : (old?.other ?? "");
    }
  }
  return next;
}

/** How many messages a catalog leaves untranslated. */
export function untranslated(catalog) {
  return Object.values(catalog).filter((v) =>
    typeof v === "string" ? v === "" : Object.values(v).some((f) => f === ""),
  ).length;
}

/**
 * Bring every catalog in `localesDir` up to date: en.json always, plus each
 * language that already has a file and each in `add`. Returns the files that
 * changed (or would change, with `check`).
 */
export function extract({ srcDir, localesDir, add = [], check = false }) {
  const messages = collect(srcDir);
  if (!existsSync(localesDir) && !check) mkdirSync(localesDir, { recursive: true });
  const languages = new Set(["en", ...add]);
  if (existsSync(localesDir))
    for (const f of readdirSync(localesDir))
      if (f.endsWith(".json")) languages.add(f.slice(0, -5));
  const changed = [];
  const report = [];
  for (const language of [...languages].sort()) {
    const path = join(localesDir, `${language}.json`);
    const before = existsSync(path) ? readFileSync(path, "utf8") : "";
    const current = before ? JSON.parse(before) : {};
    const catalog = updateCatalog(language, messages, current);
    const after = `${JSON.stringify(catalog, null, 2)}\n`;
    if (after !== before) {
      changed.push(path);
      if (!check) writeFileSync(path, after);
    }
    report.push({
      language,
      messages: messages.size,
      untranslated: language === "en" ? 0 : untranslated(catalog),
    });
  }
  return { changed, report, messages };
}
