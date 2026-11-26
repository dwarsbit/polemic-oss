import { extract } from "@scholarkit/i18n/extract";
import { describe, expect, it } from "vitest";

describe("catalogs", () => {
  it("hold every message the code uses, and only those", () => {
    // Out of date: run `pnpm i18n` in apps/polemic.
    // Settings and the update card show @scholarkit/updates' text too.
    const { changed } = extract({
      srcDir: [
        "src",
        "node_modules/@scholarkit/updates/src",
        "node_modules/@scholarkit/account-menu/src",
        "node_modules/@scholarkit/collab/src",
        "node_modules/@scholarkit/assistant/src",
      ],
      localesDir: "src/locales",
      check: true,
    });
    expect(changed).toEqual([]);
  }, 30_000); // It reads every source file: slow on a busy CI runner.
});
