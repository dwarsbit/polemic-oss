// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Folders no preset should lint: build output, caches and generated code. */
export const ignores = globalIgnores([
  "**/node_modules/",
  "**/dist/",
  "**/dist-web/",
  "**/dist-clipper*/",
  "**/.next/",
  "**/out/",
  "**/coverage/",
  "**/.turbo/",
  "**/playwright-report/",
  "**/test-results/",
  "**/src-tauri/",
  "**/next-env.d.ts",
  "**/.source/",
]);

/**
 * Rules for every package: ESLint's and typescript-eslint's recommended sets.
 * Formatting is Prettier's job, so `eslint-config-prettier` turns off the rules
 * that would fight it. It comes last.
 */
export const base = defineConfig(
  ignores,
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false },
      ],
      // An empty catch is how the apps say "ignore this failure" (storage, JSON parsing).
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Tool configs next to a package.json run in Node, whatever the package is.
    files: ["*.config.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: { globals: globals.node },
  },
  prettier,
);

export default base;
