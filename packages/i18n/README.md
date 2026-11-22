# @scholarkit/i18n

Interface languages for the Scholarkit apps: the active language, message lookup, plurals and the tooling that keeps each app's catalogs in step with its code. MIT licensed, so Polemic can use it.

## Writing interface text

Write every message in English, as a whole sentence, and pass it through `t()`. The English is the message's key, and a language that hasn't translated it shows the English.

```tsx
import { t, tn } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";

t("Open project…");
t("Saved {file}.", { file });
tn(count, "{count} file", "{count} files"); // the English plural is the key
rich("Press <0>Cmd+S</0> to compile.", [(c) => <kbd>{c}</kbd>]);
```

- **Whole sentences.** Don't build a sentence from pieces (`"Move " + name + " to the trash?"`): other languages order words differently. Put the variable part in a placeholder, and markup in a numbered tag.
- **Plurals with `tn()`**, never `count === 1 ? "" : "s"`. Each language gives the forms it needs.
- **Named placeholders** that say what goes there: `{file}`, `{count}`, not `{value}`.
- **`msg()`** marks text in a table that is built before it is shown; translate it where it is shown, with `t(item.label)`.
- Leave out what isn't language: code, LaTeX snippets, class names, product and font names, messages for the AI model.

The `scholarkit/no-literal-text` rule (the `i18n` preset of `@scholarkit/eslint-config`) flags JSX text and text attributes that skip `t()`.

## Starting the app

The language is picked once, before the app's modules load, and switching reloads the window. That keeps text in module-level tables right.

```ts
import { startLanguage } from "@scholarkit/i18n";

await startLanguage({ loaders: catalogs, dev: import.meta.env.DEV });
const { default: App } = await import("./App");
```

`startLanguage` takes the saved choice (`saveLanguage`), else the device's language, else English. In development builds the pseudo-language `[Ƥšéûðö]` is offered too: it accents every translated message, so text that skipped `t()` stands out in plain English.

## Catalogs

Each app keeps one JSON file per language in `src/locales`, keyed by the English message:

- `en.json` lists the English: the source translators work from.
- `nl.json`, `de.json` and the others hold the translations. An empty string is untranslated and shows the English. A plural holds every form its language needs (`one`, `other`, and `many` for French and Spanish).

```sh
pnpm i18n                                         # bring the catalogs up to date
scholarkit-i18n extract --add nl src src/locales  # start a catalog for Dutch
```

A shared package with interface text, such as `@scholarkit/updates`, uses `t()` too. The app's catalogs hold its messages: list the package's `src` after the app's own, as `node_modules/@scholarkit/updates/src`, which works in the workspace and in the mirrors.

A new language starts as a draft. Release builds and emails offer only the languages marked `reviewed` in `LANGUAGES` (`src/translator.ts`); development builds offer the drafts too, so they can be checked in place. Set `reviewed: true` once people have read the whole translation, in every app.

A test in each app runs the extraction in check mode, so a pull request whose catalogs are out of date fails.

## Moving an app's text into `t()`

Two scripts did this for Polemic and do it for the next app. Review what they change.

1. `node scripts/codemod.mjs <app>/src`: JSX text, text attributes and text properties (`label`, `title`, `description` and the like) into `t()` and `rich()` calls.
2. `node scripts/leftovers.mjs <app>/src > list.txt`: the strings that still read like text. Take out the lines that are code, then `node scripts/wrap.mjs list.txt`.
3. Fix by hand what they print or split: plurals, sentences built from pieces.
