import { useState } from "react";
import {
  LANGUAGES,
  PSEUDO_LANGUAGE,
  resolveLanguage,
  saveLanguage,
  savedLanguage,
  SYSTEM,
  t,
} from "@scholarkit/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorText } from "@/lib/error-text";
import { languageCodes } from "@/lib/languages";
import { useProjectStore } from "@/store/project";

/** A language's own name, for the list and the system choice. */
function nameOf(code: string): string {
  if (code === PSEUDO_LANGUAGE.code) return PSEUDO_LANGUAGE.name;
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/**
 * The interface language: the device's, or one picked here. Switching
 * saves open files and reloads the window, since every message is
 * translated as the app loads.
 */
export function LanguageSelect() {
  const [value, setValue] = useState(savedLanguage);
  const [error, setError] = useState<string | null>(null);
  const system = nameOf(resolveLanguage(SYSTEM, navigator.languages, languageCodes));

  async function choose(next: string) {
    if (next === value) return;
    try {
      await useProjectStore.getState().flushBuffers();
    } catch (e) {
      setError(errorText(e));
      return;
    }
    setValue(next);
    saveLanguage(next);
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) void choose(next);
        }}
      >
        <SelectTrigger className="w-44" aria-label={t("Interface language")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SYSTEM}>
            {t("System ({language})", { language: system })}
          </SelectItem>
          {languageCodes.map((code) => (
            <SelectItem key={code} value={code} lang={code}>
              {nameOf(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
