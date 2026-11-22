/**
 * The desktop menus in the interface language. The menus are built in
 * lib.rs with their English text; when the interface is in another
 * language, the app sends this table so the menus follow. The English here
 * must match lib.rs (menu-labels.test.ts checks).
 */

import { currentLanguage, msg, SOURCE_LANGUAGE, t } from "@scholarkit/i18n";
import { isTauri, setMenuLabels } from "@/lib/tauri";

/** Every translatable menu and item, by its id in lib.rs. */
export const MENU_LABELS: Record<string, string> = {
  menu_app: msg("Polemic"),
  menu_file: msg("File"),
  menu_edit: msg("Edit"),
  menu_insert: msg("Insert"),
  menu_view: msg("View"),
  menu_project: msg("Project"),
  menu_window: msg("Window"),
  menu_help: msg("Help"),
  menu_develop: msg("Develop"),
  new_project: msg("New project…"),
  open_project: msg("Open project…"),
  save: msg("Save"),
  compile: msg("Compile"),
  export_pdf: msg("Export PDF…"),
  reveal_build: msg("Reveal build folder"),
  close_project: msg("Close project"),
  find_in_file: msg("Find in file"),
  search: msg("Find in project…"),
  format: msg("Format document"),
  add_comment: msg("Add comment"),
  toggle_comment: msg("Toggle line comment"),
  insert_table: msg("Table…"),
  wrap_figure: msg("Figure from image…"),
  insert_tikz: msg("TikZ picture…"),
  insert_csv: msg("Table or plot from CSV…"),
  insert_citation: msg("Citation…"),
  insert_reference: msg("Reference…"),
  insert_footnote: msg("Footnote"),
  insert_display_math: msg("Display math"),
  face_code: msg("Code"),
  face_visual: msg("Visual"),
  toggle_sidebar: msg("Navigator"),
  toggle_preview: msg("PDF Preview"),
  toggle_right: msg("Properties"),
  issues: msg("Issues"),
  log: msg("Compile Log"),
  command_palette: msg("Command palette…"),
  zoom_reset: msg("Actual size"),
  zoom_in: msg("Zoom in"),
  zoom_out: msg("Zoom out"),
  packages: msg("Packages…"),
  document_settings: msg("Document settings…"),
  sources: msg("Bibliography sources…"),
  take_snapshot: msg("Take snapshot"),
  commit: msg("Commit…"),
  share: msg("Share…"),
  settings: msg("Settings…"),
  help: msg("Polemic help"),
  shortcuts: msg("Keyboard shortcuts"),
  report_issue: msg("Report an issue…"),
  about: msg("About Polemic"),
  check_updates: msg("Check for updates…"),
  component_gallery: msg("Component gallery"),
};

/** Translate the desktop menus, unless the interface is in English. */
export async function translateMenus(): Promise<void> {
  if (!isTauri() || currentLanguage() === SOURCE_LANGUAGE) return;
  const labels: Record<string, string> = {};
  for (const [id, english] of Object.entries(MENU_LABELS)) labels[id] = t(english);
  await setMenuLabels(labels);
}
