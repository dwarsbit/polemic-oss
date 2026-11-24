import { describe, expect, it } from "vitest";
import { addressOf, projectPathIn } from "@/web/session";

const BASE = "/polemic";

describe("addressOf", () => {
  it("puts a project's path and the list under where the app is served", () => {
    expect(addressOf("/projects/AbC_123-x", BASE)).toBe("/polemic/projects/AbC_123-x");
    expect(addressOf(null, BASE)).toBe("/polemic/projects");
  });
});

describe("projectPathIn", () => {
  it("reads the project's path from an address", () => {
    expect(projectPathIn("/polemic/projects/AbC_123-x", BASE)).toBe(
      "/projects/AbC_123-x",
    );
    expect(projectPathIn("/polemic/projects/AbC_123-x/", BASE)).toBe(
      "/projects/AbC_123-x",
    );
  });

  it("finds none on the list or outside the app", () => {
    expect(projectPathIn("/polemic/projects", BASE)).toBeNull();
    expect(projectPathIn("/polemic/projects/", BASE)).toBeNull();
    expect(projectPathIn("/polemic/", BASE)).toBeNull();
    expect(projectPathIn("/polemic", BASE)).toBeNull();
    // The address from before the move: the proxy redirects it before the app loads.
    expect(projectPathIn("/projects/AbC_123-x", BASE)).toBeNull();
    expect(projectPathIn("/polemic/projects/a/b", BASE)).toBeNull();
  });
});
