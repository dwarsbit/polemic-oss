import { react } from "@scholarkit/eslint-config";
import globals from "globals";

export default [
  ...react,
  // The catalog tooling runs in Node.
  { files: ["scripts/**"], languageOptions: { globals: globals.node } },
];
