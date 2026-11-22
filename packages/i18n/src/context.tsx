"use client";

/**
 * A translator for part of a React tree, for apps that render for several
 * languages at once (server rendering): the server picks the language and
 * passes its catalog to `TranslatorProvider`, and components read
 * `const { t } = useTranslator()`. The desktop and browser apps use the
 * module-level `t()` instead.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createTranslator,
  SOURCE_LANGUAGE,
  type Catalog,
  type Translator,
} from "./index";

const TranslatorContext = createContext<Translator>(createTranslator(SOURCE_LANGUAGE));

export function TranslatorProvider({
  language,
  catalog,
  children,
}: {
  language: string;
  catalog: Catalog;
  children: ReactNode;
}) {
  const translator = useMemo(
    () => createTranslator(language, catalog),
    [language, catalog],
  );
  return <TranslatorContext value={translator}>{children}</TranslatorContext>;
}

/** The translator of the nearest `TranslatorProvider`; English without one. */
export function useTranslator(): Translator {
  return useContext(TranslatorContext);
}
