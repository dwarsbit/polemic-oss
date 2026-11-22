// @ts-check
import { defineConfig } from "eslint/config";

/** Attributes whose string is shown to the reader. */
const TEXT_ATTRIBUTES =
  /^(title|label|placeholder|alt|aria-label|aria-description|aria-placeholder|description)$/;

/** Text with a word in it: at least two letters in a row. */
const WORDY = /\p{L}{2,}/u;

/**
 * An attribute's text reads as language when it has words with spaces
 * between them, or is one capitalized word. One lowercase token (a URL, an
 * address, a LaTeX command, a program name) is an example, not language.
 */
const reads = (/** @type {string} */ s) =>
  WORDY.test(s) &&
  (/\p{L}\s+\S/u.test(s.trim()) || /^\p{Lu}\p{Ll}+…?$/u.test(s.trim()));

/** @type {import("eslint").Rule.RuleModule} */
const noLiteralText = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Interface text goes through t() (or tn(), rich()) so it can be translated.",
    },
    messages: {
      text: "Wrap this text in t() so it can be translated.",
      attribute: "Wrap the {{name}} text in t() so it can be translated.",
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {any} node */
      JSXText(node) {
        if (WORDY.test(node.value)) context.report({ node, messageId: "text" });
      },
      /** @param {any} node */
      JSXAttribute(node) {
        const name = node.name.type === "JSXIdentifier" ? node.name.name : "";
        if (!TEXT_ATTRIBUTES.test(name)) return;
        let value = node.value;
        if (value?.type === "JSXExpressionContainer") value = value.expression;
        const text =
          value?.type === "Literal" && typeof value.value === "string"
            ? value.value
            : value?.type === "TemplateLiteral"
              ? value.quasis.map((/** @type {any} */ q) => q.value.cooked).join("")
              : null;
        if (text !== null && reads(text))
          context.report({ node, messageId: "attribute", data: { name } });
      },
    };
  },
};

/**
 * For apps whose interface is translated (see @scholarkit/i18n): JSX text
 * and text attributes must go through t(). Tests are left out. Turn it off
 * for a line with `// eslint-disable-next-line scholarkit/no-literal-text`
 * when the text isn't language (a code sample, a product name).
 */
export const i18n = defineConfig({
  files: ["**/*.{jsx,tsx}"],
  ignores: ["**/*.test.{jsx,tsx}", "**/*.spec.{jsx,tsx}"],
  plugins: { scholarkit: { rules: { "no-literal-text": noLiteralText } } },
  rules: { "scholarkit/no-literal-text": "error" },
});

export default i18n;
