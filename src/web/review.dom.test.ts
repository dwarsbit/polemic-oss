import { describe, expect, it } from "vitest";
import { shortOr } from "./review";

const LONG = "https://app.scholarkit.app/r/Xk7f3q2Pzm";

describe("the review link to hand out", () => {
  it("is the short address the server sent for this link", () => {
    expect(shortOr(LONG, "https://scholark.it/Xk7f3q2Pzm")).toBe(
      "https://scholark.it/Xk7f3q2Pzm",
    );
  });

  it("is the review page without one, or with a short address for anything else", () => {
    expect(shortOr(LONG, undefined)).toBe(LONG);
    for (const other of [
      "https://scholark.it/Ab3dE5gH7j",
      "https://scholark.it/Xk7f3q2Pzm?x=1",
      "javascript:alert(1)//Xk7f3q2Pzm",
      "https://user@scholark.it/Xk7f3q2Pzm",
      "not a url",
    ])
      expect(shortOr(LONG, other), other).toBe(LONG);
    // Links made before short codes have none.
    expect(
      shortOr(
        `https://app.scholarkit.app/r/${"x".repeat(43)}`,
        "https://scholark.it/x",
      ),
    ).toBe(`https://app.scholarkit.app/r/${"x".repeat(43)}`);
  });
});
