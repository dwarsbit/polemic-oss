import { i18n, react } from "@scholarkit/eslint-config";
import globals from "globals";

export default [
  ...react,
  // Interface text goes through t(); the Design Lab and the component
  // gallery are development tools and stay in English.
  ...i18n.map((config) => ({
    ...config,
    ignores: [
      ...(config.ignores ?? []),
      "src/lab/**",
      "src/components/ComponentGallery.tsx",
    ],
  })),
  // The corpus runner and the scripts run in Node, not in the webview.
  { files: ["tools/**", "scripts/**"], languageOptions: { globals: globals.node } },
];
