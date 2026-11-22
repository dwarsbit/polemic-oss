// @ts-check
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { base, i18n, next, node, react } from "../src/index.js";

/**
 * @param {import("eslint").Linter.Config[]} config
 * @param {string} code
 * @param {string} filePath
 */
async function lint(config, code, filePath) {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId);
}

describe("presets", () => {
  it("flags unused variables in TypeScript", async () => {
    const rules = await lint(base, "const unused: number = 1;\n", "example.ts");
    expect(rules).toContain("@typescript-eslint/no-unused-vars");
  });

  it("allows unused names that start with an underscore", async () => {
    const rules = await lint(base, "export function f(_a: number) {}\n", "example.ts");
    expect(rules).toEqual([]);
  });

  it("asks for type-only imports", async () => {
    const code = 'import { Linter } from "eslint";\nexport type C = Linter.Config;\n';
    const rules = await lint(base, code, "example.ts");
    expect(rules).toContain("@typescript-eslint/consistent-type-imports");
  });

  it("knows Node globals in the node preset", async () => {
    const code = "export const dir = process.cwd();\n";
    expect(await lint(base, code, "example.js")).toContain("no-undef");
    expect(await lint(node, code, "example.js")).toEqual([]);
  });

  it("checks the rules of hooks in the react preset", async () => {
    const code = [
      'import { useState } from "react";',
      "export function C({ on }: { on: boolean }) {",
      "  if (on) useState(0);",
      "  return null;",
      "}",
      "",
    ].join("\n");
    const rules = await lint(react, code, "example.tsx");
    expect(rules).toContain("react-hooks/rules-of-hooks");
  });

  it("leaves formatting to Prettier", async () => {
    const rules = await lint(base, "export const a = 1;;;;\n", "example.ts");
    expect(rules).not.toContain("no-extra-semi");
  });

  it("allows an empty catch, but no other empty block", async () => {
    expect(await lint(base, "try { f(); } catch {}\n", "example.js")).not.toContain(
      "no-empty",
    );
    expect(await lint(base, "if (a) {}\n", "example.js")).toContain("no-empty");
  });

  it("knows Node globals in tool configs of any package", async () => {
    const code = "export default { dir: process.cwd() };\n";
    expect(await lint(react, code, "vite.config.ts")).toEqual([]);
  });

  it("checks Next's rules in the next preset", async () => {
    const code = 'export function A() {\n  return <img src="/logo.png" alt="" />;\n}\n';
    const rules = await lint(next, code, "app/page.tsx");
    expect(rules).toContain("@next/next/no-img-element");
  });
});

describe("i18n", () => {
  const config = [...react, ...i18n];

  it("flags JSX text and text attributes outside t()", async () => {
    const code = 'export const A = () => <p title="Open the file">Open</p>;\n';
    const rules = await lint(config, code, "example.tsx");
    expect(rules).toEqual(["scholarkit/no-literal-text", "scholarkit/no-literal-text"]);
  });

  it("lets translated text, symbols and other attributes through", async () => {
    const code =
      'declare const t: (m: string) => string;\nexport const A = () => <p className="flex" title={t("Open")}>{t("Open")} · 3</p>;\n';
    expect(await lint(config, code, "example.tsx")).toEqual([]);
  });

  it("lets examples through: URLs, addresses, commands", async () => {
    const code =
      'export const A = () => <><input placeholder="https://example.com/v1" /><input placeholder="name@university.edu" /><input placeholder="\\label" /></>;\n';
    expect(await lint(config, code, "example.tsx")).toEqual([]);
  });

  it("leaves tests alone", async () => {
    const code = "export const A = () => <p>Open</p>;\n";
    expect(await lint(config, code, "example.test.tsx")).toEqual([]);
  });
});
