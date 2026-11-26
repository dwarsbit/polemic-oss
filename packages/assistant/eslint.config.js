import { i18n, react } from "@scholarkit/eslint-config";

export default [
  ...react,
  ...i18n,
  { files: ["demo/**"], rules: { "scholarkit/no-literal-text": "off" } },
];
