import { describe, expect, it } from "vitest";
import { MENU_LABELS } from "@/lib/menu-labels";
import rust from "../../src-tauri/src/lib.rs?raw";

/** The English text of every menu and item that lib.rs builds, by id. */
function rustLabels(): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const m of rust.matchAll(/(?:item|check)\(\s*"(\w+)",\s*"([^"]+)"/g))
    labels[m[1]] = m[2];
  for (const m of rust.matchAll(
    /SubmenuBuilder::with_id\(handle, "(\w+)", "([^"]+)"\)/g,
  ))
    labels[m[1]] = m[2];
  return labels;
}

describe("menu labels", () => {
  it("match the menus lib.rs builds", () => {
    expect(MENU_LABELS).toEqual(rustLabels());
  });
});
