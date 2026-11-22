import { describe, expect, it } from "vitest";
import { messagesIn, untranslated, updateCatalog } from "../scripts/extract.mjs";

describe("messagesIn", () => {
  it("finds t, msg, rich and tn messages", () => {
    const source = `
      t("Open");
      msg("Light");
      rich("Press <0>Cmd</0>", []);
      tn(n, "{count} file", "{count} files");
      t(variable);
    `;
    expect(messagesIn(source).map((m) => m.message)).toEqual([
      "Open",
      "Light",
      "Press <0>Cmd</0>",
      "{count} files",
    ]);
  });
});

describe("updateCatalog", () => {
  const messages = new Map([
    ["Open", { where: [] }],
    [
      "{count} files",
      { plural: { one: "{count} file", other: "{count} files" }, where: [] },
    ],
  ]);

  it("lists the English as the source", () => {
    expect(updateCatalog("en", messages)).toEqual({
      Open: "Open",
      "{count} files": { one: "{count} file", other: "{count} files" },
    });
  });

  it("keeps translations, adds new messages empty and drops old ones", () => {
    const catalog = updateCatalog("nl", messages, { Open: "Openen", Gone: "Weg" });
    expect(catalog).toEqual({
      Open: "Openen",
      "{count} files": { one: "", other: "" },
    });
    expect(untranslated(catalog)).toBe(1);
  });

  it("asks for every plural form the language has", () => {
    expect(
      Object.keys(updateCatalog("fr", messages)["{count} files"] as object).sort(),
    ).toEqual(Object.keys({ many: "", one: "", other: "" }).sort());
  });
});
