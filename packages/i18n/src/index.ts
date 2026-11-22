/**
 * Interface languages for the Scholarkit apps.
 *
 * Messages are written in English in the code and passed through `t()`:
 * `t("Open project…")`, `t("Saved {time}", { time })`. The English text is the
 * message's key, so the code reads as it did, and a language that hasn't
 * translated a message shows the English. `scholarkit-i18n extract` collects
 * every message into the app's catalogs, one JSON file per language.
 *
 * The active language is set once, before the app's modules load (see
 * `startLanguage`), and switching languages reloads the app. That keeps
 * messages in module-level constants right without making every one lazy.
 */

import {
  createTranslator,
  offered,
  PSEUDO_LANGUAGE,
  resolveLanguage,
  SOURCE_LANGUAGE,
  SYSTEM,
  type Catalog,
  type Translator,
  type Values,
} from "./translator";

export {
  LANGUAGES,
  offered,
  PSEUDO_LANGUAGE,
  SOURCE_LANGUAGE,
  SYSTEM,
  acceptedLanguages,
  resolveLanguage,
  type LanguageInfo,
  type LanguagePreference,
} from "./translator";
export {
  createTranslator,
  format,
  type Catalog,
  type PluralForms,
  type Translator,
  type Values,
} from "./translator";

let active: Translator = createTranslator(SOURCE_LANGUAGE);

/** Make `language` the active one, with its translations. */
export function activate(language: string, catalog: Catalog = {}): void {
  active = createTranslator(language, catalog);
}

/** The active language's code, for `lang` attributes and `Intl` formatters. */
export function currentLanguage(): string {
  return active.language;
}

/** Translate a message into the active language and fill its placeholders. */
export function t(message: string, values?: Values): string {
  return active.t(message, values);
}

/**
 * Translate a message that depends on a number: `tn(n, "{count} file", "{count} files")`.
 * The English plural is the key; other languages give every form they need.
 * `{count}` is filled with the number.
 */
export function tn(count: number, one: string, other: string, values?: Values): string {
  return active.tn(count, one, other, values);
}

/**
 * Mark a message for translation without translating it yet: for messages
 * in tables that are built before they are shown. Translate them where they
 * are shown, with `t(item.label)`.
 */
export function msg<T extends string>(message: T): T {
  return message;
}

/** A number in the active language's style. */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return active.formatNumber(value, options);
}

/** A date or time in the active language's style. */
export function formatDate(
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return active.formatDate(value, options);
}

/** A list in the active language's style: "A, B and C". */
export function formatList(
  items: readonly string[],
  type: Intl.ListFormatType = "conjunction",
): string {
  return active.formatList(items, type);
}

/** "3 minutes ago", "in 2 days" in the active language. */
export function formatRelative(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string {
  return active.formatRelative(value, unit, options);
}

/** Where the choice is saved, so it is known before the app loads. */
export const STORAGE_KEY = "scholarkit.language";

/** Loaders for the languages an app ships, besides English. */
export type CatalogLoaders = Record<string, () => Promise<{ default: Catalog }>>;

/** The saved choice, or "system". */
export function savedLanguage(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): string {
  try {
    return storage?.getItem(STORAGE_KEY) ?? SYSTEM;
  } catch {
    return SYSTEM;
  }
}

/** Save the choice. The app reloads to show it. */
export function saveLanguage(
  preference: string,
  storage:
    Pick<Storage, "setItem" | "removeItem"> | undefined = globalThis.localStorage,
): void {
  try {
    if (preference === SYSTEM) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, preference);
  } catch {}
}

/**
 * The language codes an app can show: English, its catalogs of reviewed
 * languages, and in development the drafts and the pseudo-language too.
 */
export function availableLanguages(loaders: CatalogLoaders, dev = false): string[] {
  return [
    SOURCE_LANGUAGE,
    ...Object.keys(loaders).filter((code) => offered(code, dev)),
    ...(dev ? [PSEUDO_LANGUAGE.code] : []),
  ];
}

/**
 * Pick and load the language before the app renders: the saved choice, else
 * the device's, else English. Sets `<html lang>`. A catalog that fails to
 * load leaves the app in English.
 */
export async function startLanguage(options: {
  loaders: CatalogLoaders;
  dev?: boolean;
  preference?: string;
  deviceLanguages?: readonly string[];
}): Promise<string> {
  const available = availableLanguages(options.loaders, options.dev);
  const deviceLanguages =
    options.deviceLanguages ?? globalThis.navigator?.languages ?? [];
  // The pseudo-language is never the device's: only an explicit choice picks it.
  const language = resolveLanguage(
    options.preference ?? savedLanguage(),
    deviceLanguages,
    available,
  );
  let catalog: Catalog = {};
  const load = options.loaders[language];
  if (load) {
    try {
      catalog = (await load()).default;
    } catch {
      activate(SOURCE_LANGUAGE);
      return SOURCE_LANGUAGE;
    }
  }
  activate(language, catalog);
  if (typeof document !== "undefined") document.documentElement.lang = language;
  return language;
}
