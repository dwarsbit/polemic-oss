import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The demo page: every part of the panel with sample answers, in each app's tint.
// `pnpm demo`, then ?app=polemic|cursive|binder&theme=light|dark&view=panel|menu.
export default defineConfig({ plugins: [react()] });
