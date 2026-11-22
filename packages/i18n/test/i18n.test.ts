import { afterEach, describe, expect, it } from "vitest";
import {
  acceptedLanguages,
  availableLanguages,
  activate,
  createTranslator,
  currentLanguage,
  format,
  msg,
  offered,
  PSEUDO_LANGUAGE,
  resolveLanguage,
  saveLanguage,
  savedLanguage,
  startLanguage,
  STORAGE_KEY,
  t,
  tn,
} from "../src/index";

afterEach(() => activate("en"));

describe("t", () => {
  it("passes English through and fills placeholders", () => {
    expect(t("Open {file}", { file: "main.tex" })).toBe("Open main.tex");
  });

  it("uses the active catalog, falling back to English", () => {
    activate("nl", { "Open {file}": "{file} openen", Untranslated: "" });
    expect(t("Open {file}", { file: "main.tex" })).toBe("main.tex openen");
    expect(t("Untranslated")).toBe("Untranslated");
    expect(t("Missing")).toBe("Missing");
  });
});

describe("format", () => {
  it("leaves braces it has no value for, so LaTeX passes through", () => {
    expect(format("Add \\input{} to {file}", { file: "a.tex" })).toBe(
      "Add \\input{} to a.tex",
    );
    expect(format("\\begin{{env}}", { env: "table" })).toBe("\\begin{table}");
  });

  it("shows nothing for null and undefined", () => {
    expect(format("a{x}b", { x: null })).toBe("ab");
  });
});

describe("tn", () => {
  it("picks the English form by count", () => {
    expect(tn(1, "{count} file", "{count} files")).toBe("1 file");
    expect(tn(3, "{count} file", "{count} files")).toBe("3 files");
  });

  it("picks the language's plural category", () => {
    activate("fr", {
      "{count} files": { one: "{count} fichier", other: "{count} fichiers" },
    });
    expect(tn(0, "{count} file", "{count} files")).toBe("0 fichier");
    expect(tn(2, "{count} file", "{count} files")).toBe("2 fichiers");
  });
});

describe("pseudo-language", () => {
  it("accents letters but keeps placeholders", () => {
    activate(PSEUDO_LANGUAGE.code);
    expect(t("Open {file}", { file: "x" })).toBe("[Öþéñ x]");
  });
});

describe("msg", () => {
  it("returns the message as written", () => {
    activate("nl", { Light: "Licht" });
    expect(msg("Light")).toBe("Light");
  });
});

describe("resolveLanguage", () => {
  const available = ["en", "nl", "de"];

  it("takes a saved choice the app has", () => {
    expect(resolveLanguage("de", ["nl-NL"], available)).toBe("de");
  });

  it("follows the device, matching on the base language", () => {
    expect(resolveLanguage("system", ["fr-FR", "nl-BE"], available)).toBe("nl");
  });

  it("falls back to English", () => {
    expect(resolveLanguage("system", ["ja-JP"], available)).toBe("en");
    expect(resolveLanguage("it", [], available)).toBe("en");
  });
});

describe("startLanguage", () => {
  it("loads the catalog of the device's language", async () => {
    const language = await startLanguage({
      loaders: { nl: async () => ({ default: { Save: "Opslaan" } }) },
      dev: true, // Dutch is a draft: only development builds offer it.
      preference: "system",
      deviceLanguages: ["nl-NL"],
    });
    expect(language).toBe("nl");
    expect(t("Save")).toBe("Opslaan");
  });

  it("stays in English when a catalog fails to load", async () => {
    const language = await startLanguage({
      loaders: { nl: () => Promise.reject(new Error("offline")) },
      dev: true,
      preference: "nl",
      deviceLanguages: [],
    });
    expect(language).toBe("en");
  });
});

describe("saved choice", () => {
  it("stores a language and forgets it for system", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    saveLanguage("de", storage);
    expect(store.get(STORAGE_KEY)).toBe("de");
    expect(savedLanguage(storage)).toBe("de");
    saveLanguage("system", storage);
    expect(savedLanguage(storage)).toBe("system");
  });
});

describe("createTranslator", () => {
  it("translates in its own language without changing the active one", () => {
    const nl = createTranslator("nl", {
      "Open {file}": "{file} openen",
      "{count} files": { one: "{count} bestand", other: "{count} bestanden" },
    });
    expect(nl.t("Open {file}", { file: "a.tex" })).toBe("a.tex openen");
    expect(nl.tn(1, "{count} file", "{count} files")).toBe("1 bestand");
    expect(nl.formatNumber(1234.5)).toBe("1.234,5");
    expect(t("Open {file}", { file: "a.tex" })).toBe("Open a.tex");
    expect(currentLanguage()).toBe("en");
  });
});

describe("acceptedLanguages", () => {
  it("orders the header's languages by weight", () => {
    expect(acceptedLanguages("en;q=0.8, nl-BE,nl;q=0.9,*;q=0.1")).toEqual([
      "nl-BE",
      "nl",
      "en",
    ]);
    expect(acceptedLanguages("de;q=0")).toEqual([]);
    expect(acceptedLanguages(null)).toEqual([]);
  });

  it("feeds resolveLanguage", () => {
    expect(
      resolveLanguage(null, acceptedLanguages("fr-CA,fr;q=0.9"), ["en", "fr"]),
    ).toBe("fr");
  });
});

describe("availableLanguages", () => {
  const loaders = {
    nl: async () => ({ default: {} }),
    de: async () => ({ default: {} }),
  };

  it("leaves draft languages out of release builds", () => {
    expect(availableLanguages(loaders)).toEqual(["en"]);
  });

  it("offers the drafts and the pseudo-language in development", () => {
    expect(availableLanguages(loaders, true)).toEqual(["en", "nl", "de", "en-XA"]);
  });

  it("knows a language is offered once it is reviewed", () => {
    expect(offered("nl")).toBe(false);
    expect(offered("nl", true)).toBe(true);
  });
});
