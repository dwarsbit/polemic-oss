#!/usr/bin/env node
// scholarkit-i18n extract [--check] [--add <lang>] <src>... <locales>
//
//   extract   bring the catalogs in <locales> up to date with the messages in each <src>
//             (the app's folder, and node_modules/<package>/src for a shared package it shows)
//   --check   change nothing; exit 1 if a catalog is out of date (CI and tests)
//   --add     start a catalog for a new language

import { extract } from "./extract.mjs";

const args = process.argv.slice(2);
const command = args.shift();
const check = args.includes("--check");
const add = [];
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") continue;
  if (args[i] === "--add") add.push(args[++i]);
  else rest.push(args[i]);
}
if (command !== "extract" || rest.length < 2) {
  console.error(
    "Usage: scholarkit-i18n extract [--check] [--add <lang>] <src>... <locales>",
  );
  process.exit(2);
}
const localesDir = rest.pop();
const srcDir = rest;
const { changed, report } = extract({ srcDir, localesDir, add, check });
for (const r of report)
  console.log(
    `${r.language}: ${r.messages} messages${r.untranslated ? `, ${r.untranslated} untranslated` : ""}`,
  );
if (check && changed.length) {
  console.error(
    `Out of date: ${changed.join(", ")}. Run scholarkit-i18n extract ${srcDir.join(" ")} ${localesDir}.`,
  );
  process.exit(1);
}
for (const path of check ? [] : changed) console.log(`Wrote ${path}`);
