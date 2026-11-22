/**
 * The interface languages Polemic ships: one catalog per language in
 * src/locales, loaded when it is picked. English is the source and needs
 * none. `pnpm i18n` brings the catalogs up to date with the code.
 */

import {
  availableLanguages,
  type Catalog,
  type CatalogLoaders,
  SOURCE_LANGUAGE,
} from "@scholarkit/i18n";

const files = import.meta.glob<{ default: Catalog }>("../locales/*.json");

export const catalogs: CatalogLoaders = Object.fromEntries(
  Object.entries(files)
    .map(([path, load]) => [/([\w-]+)\.json$/.exec(path)?.[1] ?? "", load] as const)
    .filter(([code]) => code !== "" && code !== SOURCE_LANGUAGE),
);

/** The languages the settings offer: in development, the pseudo-language too. */
export const languageCodes = availableLanguages(catalogs, import.meta.env.DEV);
