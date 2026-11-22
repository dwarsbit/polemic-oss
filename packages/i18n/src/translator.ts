/**
 * Messages in one language, without the apps' active language: the part of
 * this package a Node server uses (the API's emails). Built to dist/ as
 * `@scholarkit/i18n/translator`; the apps get it through the package's main
 * entry. It imports nothing, so the built file runs in Node as it is.
 */

/** A plural message's forms in one language, by `Intl.PluralRules` category. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string;
};

/** One language's translations, keyed by the English message. */
export type Catalog = Record<string, string | PluralForms>;

/** Values for a message's {placeholders}. Like React, null and undefined show nothing. */
export type Values = Record<string, string | number | null | undefined>;

/**
 * One language's messages and formatters. The apps use the module-level
 * functions below, which follow the active language. A server that answers
 * people in different languages at once (the account pages, the emails) makes
 * one translator per request with `createTranslator` instead.
 */
export interface Translator {
  language: string;
  /** Translate a message and fill its placeholders. */
  t(message: string, values?: Values): string;
  /**
   * Translate a message that depends on a number: `tn(n, "{count} file", "{count} files")`.
   * The English plural is the key; other languages give every form they need.
   * `{count}` is filled with the number.
   */
  tn(count: number, one: string, other: string, values?: Values): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
  formatList(items: readonly string[], type?: Intl.ListFormatType): string;
  formatRelative(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ): string;
}

/**
 * Fill a message's {placeholders}. A placeholder the values don't name stays
 * as written, so LaTeX such as `\\input{}` passes through.
 */
export function format(message: string, values?: Values): string {
  if (!values) return message;
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => {
    if (!(name in values)) return whole;
    const value = values[name];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/** A translator for `language` with its catalog (empty for English). */
export function createTranslator(language: string, catalog: Catalog = {}): Translator {
  const isPseudo = language === PSEUDO_LANGUAGE.code;
  const plurals = new Intl.PluralRules(language);
  const lookup = (message: string): string | PluralForms | undefined => {
    if (isPseudo) return undefined;
    const found = catalog[message];
    return found === "" ? undefined : found;
  };
  const finish = (message: string) => (isPseudo ? pseudo(message) : message);
  return {
    language,
    t(message, values) {
      const found = lookup(message);
      const text = typeof found === "string" ? found : (found?.other ?? message);
      return format(finish(text), values);
    },
    tn(count, one, other, values) {
      const found = lookup(other);
      const category = plurals.select(count);
      let text: string;
      if (typeof found === "object") text = found[category] ?? found.other;
      else if (typeof found === "string") text = found;
      else text = category === "one" ? one : other;
      return format(finish(text), { count, ...values });
    },
    formatNumber: (value, options) =>
      new Intl.NumberFormat(language, options).format(value),
    formatDate: (value, options) =>
      new Intl.DateTimeFormat(language, options).format(value),
    formatList: (items, type = "conjunction") =>
      new Intl.ListFormat(language, { type }).format(items),
    formatRelative: (value, unit, options) =>
      new Intl.RelativeTimeFormat(language, options).format(value, unit),
  };
}

// --- Languages ----------------------------------------------------------

/**
 * The interface languages the apps can show. English is the source: every
 * message is written in English in the code, and the other languages
 * translate it.
 */

export const SOURCE_LANGUAGE = "en";

/** A language the apps ship, with its name written in that language. */
export interface LanguageInfo {
  code: string;
  /** The language's own name, so a reader finds theirs in any interface. */
  name: string;
  /**
   * Whether people reviewed its translation. Release builds and emails offer
   * only reviewed languages; development builds offer the drafts too.
   */
  reviewed: boolean;
}

/** Every interface language, in the order the settings list them. */
export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "en", name: "English", reviewed: true },
  { code: "de", name: "Deutsch", reviewed: false },
  { code: "es", name: "Español", reviewed: false },
  { code: "fr", name: "Français", reviewed: false },
  { code: "nl", name: "Nederlands", reviewed: false },
];

/**
 * Whether a build may offer a language that has a catalog: a reviewed one
 * always, a draft only in development.
 */
export function offered(code: string, dev = false): boolean {
  return dev || LANGUAGES.some((l) => l.code === code && l.reviewed);
}

/**
 * A made-up language for development builds: every message comes out
 * accented and in brackets, so text the code forgot to translate stands
 * out in English.
 */
export const PSEUDO_LANGUAGE: LanguageInfo = {
  code: "en-XA",
  name: "[Ƥšéûðö]",
  reviewed: false,
};

/** The saved choice: a language code, or "system" to follow the device. */
export type LanguagePreference = string;

export const SYSTEM = "system";

/**
 * The language to show: the saved choice when the app has it, otherwise the
 * first of the device's languages the app has (matched on the base language,
 * so "nl-BE" picks "nl"), otherwise English.
 */
export function resolveLanguage(
  preference: LanguagePreference | null | undefined,
  deviceLanguages: readonly string[],
  available: readonly string[],
): string {
  if (preference && preference !== SYSTEM && available.includes(preference))
    return preference;
  for (const tag of deviceLanguages) {
    if (available.includes(tag)) return tag;
    const base = tag.toLowerCase().split("-")[0] ?? "";
    if (available.includes(base)) return base;
  }
  return SOURCE_LANGUAGE;
}

/**
 * The languages an HTTP `Accept-Language` header asks for, most wanted first:
 * "nl-BE,nl;q=0.9,en;q=0.8" gives ["nl-BE", "nl", "en"]. For `resolveLanguage`
 * on a server, where the request stands in for the device.
 */
export function acceptedLanguages(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const weight = q === undefined ? 1 : Number(q);
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((l) => l.tag !== "" && l.tag !== "*" && l.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((l) => l.tag);
}

// --- The pseudo-language ------------------------------------------------

/**
 * The pseudo-language: each message with its letters accented and wrapped in
 * brackets. Placeholders ({name}) and tags (<0>…</0>) stay as they are, so
 * the result still formats.
 */

const ACCENTS: Record<string, string> = {
  a: "á",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "î",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ö",
  p: "þ",
  q: "ǫ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "û",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Á",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Î",
  J: "Ĵ",
  K: "Ķ",
  L: "Ļ",
  M: "Ṁ",
  N: "Ñ",
  O: "Ö",
  P: "Þ",
  Q: "Ǫ",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Û",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

export function pseudo(message: string): string {
  const out = message.replace(
    /(\{[A-Za-z0-9_]+\}|<\/?\d+>|\\[A-Za-z]+)|([A-Za-z])/g,
    (_m, keep: string | undefined, letter: string | undefined) =>
      keep ?? ACCENTS[letter ?? ""] ?? letter ?? "",
  );
  return `[${out}]`;
}
