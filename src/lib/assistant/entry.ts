/**
 * Ways into the assistant from elsewhere in the editor: the editor's
 * context menu (the Ask menu on the selection) and Ask AI on a compile
 * issue.
 */

import { t } from "@scholarkit/i18n";
import type { CompileIssue } from "@/lib/tauri";
import { useAssistantStore } from "@/store/assistant";

/** The Ask menu on the editor's selection; without one, the assistant. */
export function askAboutSelection(): void {
  useAssistantStore.getState().openMenu();
}

/** Shows the assistant and asks for a fix for the issue. */
export function askAboutIssue(issue: CompileIssue): void {
  const store = useAssistantStore.getState();
  store.setContext({ issue });
  store.show();
  if (!store.working()) void store.ask(t("Fix this error."));
}
