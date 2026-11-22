import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortcut, isMac } from "@/lib/platform";
import { t } from "@scholarkit/i18n";

/** Shortcut groups; keys are platform-neutral specs ("Mod" is ⌘ on
 *  macOS and Ctrl elsewhere) or a plain description of a gesture. */
const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: t("General"),
    items: [
      ["Mod+P", t("Command palette")],
      ["Mod+,", t("Settings")],
      ["Mod+Alt+/", t("Keyboard shortcuts")],
      ["Mod+O", t("Open project")],
      ["Mod+Shift+W", t("Close project")],
    ],
  },
  {
    group: t("Files and output"),
    items: [
      ["Mod+S", t("Save and compile")],
      ["Mod+Shift+R", t("Compile")],
      ["Mod+E", "Export PDF"],
      ["Mod+Shift+E", t("Reveal build folder")],
    ],
  },
  {
    group: t("Editing"),
    items: [
      ["Mod+F", t("Find in file")],
      ["Mod+Shift+F", t("Find in project")],
      ["Shift+Alt+F", t("Format document")],
      ["Mod+/", t("Comment out the line (%)")],
      ["Mod+Alt+C", t("Add comment")],
      ["Mod+C", t("Copy the line (nothing selected)")],
      ["Mod+X", t("Cut the line (nothing selected)")],
      ["Mod+D", t("Delete the line")],
      ["Alt+G", t("Go to line")],
      ["Mod+Space", t("Complete commands, labels and citations")],
      ["Mod+B", t("Bold (\\textbf)")],
      ["Mod+I", t("Emphasis (\\emph)")],
      ["Mod+U", t("Underline (\\underline)")],
    ],
  },
  {
    group: t("Insert"),
    items: [
      ["Mod+Shift+T", t("Table")],
      ["Mod+Alt+G", t("Figure from image")],
      ["Mod+Alt+T", t("TikZ picture")],
      ["Mod+Shift+C", t("Citation")],
    ],
  },
  {
    group: t("View"),
    items: [
      ["Mod+Alt+1", t("Code")],
      ["Mod+Alt+2", t("Visual")],
      ["Mod+Alt+B", t("Navigator")],
      ["Mod+Shift+P", "PDF preview"],
      ["Mod+J", t("Properties")],
      ["Mod+Shift+M", t("Issues")],
      ["Mod+=", t("Zoom the PDF in")],
      ["Mod+-", t("Zoom the PDF out")],
      ["Mod+0", t("PDF at actual size")],
    ],
  },
  {
    group: t("Project"),
    items: [
      ["Mod+Alt+P", t("Packages")],
      ["Mod+K", t("Commit")],
    ],
  },
  {
    group: t("Mouse"),
    items: [
      [
        t("{mod}click in the editor", { mod: isMac ? "⌘" : "Ctrl+" }),
        t("Show this spot in the PDF"),
      ],
      [
        t("{mod}click in the PDF", { mod: isMac ? "⌘" : "Ctrl+" }),
        t("Show the source line"),
      ],
      [t("Right-click a marked word"), t("Corrections and dictionary")],
    ],
  },
];

/** A spec ("Mod+Shift+P") formatted for this platform; gestures pass through. */
function keysLabel(keys: string): string {
  return /^(Mod|Shift|Alt|Ctrl)(\+|$)/.test(keys) ? formatShortcut(keys) : keys;
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Keyboard shortcuts")}</DialogTitle>
        </DialogHeader>
        <div className="-mx-2 min-h-0 space-y-4 overflow-y-auto px-2">
          {SHORTCUTS.map(({ group, items }) => (
            <section key={group}>
              <p className="mb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {group}
              </p>
              <ul className="divide-y divide-border rounded-lg border">
                {items.map(([keys, description]) => (
                  <li
                    key={keys}
                    className="flex items-center justify-between gap-4 px-3 py-1.5 text-sm"
                  >
                    <span>{description}</span>
                    <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground">
                      {keysLabel(keys)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Polemic")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            "A modern LaTeX editing experience. Write, compile and revise with a live PDF preview and comments.",
          )}
        </p>
        <p className="text-sm">
          {t("Version")} <span className="font-mono">{version ?? "unknown"}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {t("Released under the MIT License.")}
        </p>
        <button
          type="button"
          className="text-sm text-primary underline-offset-2 hover:underline"
          onClick={() => void openUrl("https://github.com/dwarsbit/polemic-oss")}
        >
          {t("github.com/dwarsbit/polemic-oss")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
