import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Camera,
  FileCog,
  FileText,
  GitBranch,
  Link,
  Quote,
  Sigma,
  Superscript,
  FolderOpen,
  Image,
  Keyboard,
  MessageSquare,
  Package,
  PanelLeft,
  PanelRight,
  Percent,
  Play,
  Save,
  ScrollText,
  Search,
  Settings,
  Shapes,
  Share2,
  Sparkles,
  TableProperties,
  UserRound,
  WandSparkles,
  Zap,
} from "lucide-react";
import { exportPdfAs } from "@/lib/pdf-export";
import { formatDocument } from "@/lib/editor-format";
import { wrapFigure } from "@/lib/editor-figure";
import { insertTikzSnippet, TIKZ_SNIPPETS } from "@/lib/tikz-snippets";
import { addCommentAtCursor, addFileComment } from "@/lib/editor-comments";
import { runPanelCommand } from "@/lib/panel-commands";
import { fuzzyRank, type FuzzyItem } from "@/lib/fuzzy";
import { insertWithCompletion, runEditorCommand } from "@/lib/editor-commands";
import { insertAtCursor } from "@/lib/editor-insert";
import { formatShortcut } from "@/lib/platform";
import { openProjectDialog, revealBuildFolder, type FileEntry } from "@/lib/tauri";
import { useDialogsStore } from "@/store/dialogs";
import { usePreviewStore } from "@/store/preview";
import { useProjectStore } from "@/store/project";
import { resolveVersionControl, useSettingsStore } from "@/store/settings";
import { features } from "@/lib/target";
import { cn } from "cn";
import { t } from "@scholarkit/i18n";

/** Commands for desktop features the browser build leaves out. */
const HIDDEN_COMMANDS = new Set([
  ...(features.localFiles ? [] : ["open-project", "reveal-build"]),
  ...(features.desktopAccount ? [] : ["account"]),
  ...(features.versionControl ? [] : ["commit", "snapshot"]),
]);

interface Command {
  id: string;
  title: string;
  icon: typeof FileText;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

function collectFilePaths(entries: FileEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isDir) {
      paths.push(...collectFilePaths(entry.children));
    } else if (/\.(tex|bib)$/.test(entry.path)) {
      paths.push(entry.path);
    }
  }
  return paths;
}

export function CommandPalette() {
  const onClose = () => useDialogsStore.getState().setPaletteOpen(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const project = useProjectStore((s) => s.project);
  const files = useProjectStore((s) => s.files);
  const versionControl = useSettingsStore((s) => resolveVersionControl(s));

  const commands = useMemo<Command[]>(() => {
    const app: Command[] = [
      {
        id: "open-project",
        title: t("Open project…"),
        icon: FolderOpen,
        shortcut: formatShortcut("Mod+O"),
        keywords: t("folder existing"),
        run: () =>
          void openProjectDialog()
            .then((info) => info && useProjectStore.getState().openProject(info.path))
            .catch(() => undefined),
      },
      {
        id: "sources",
        title: t("Bibliography sources…"),
        icon: BookOpen,
        keywords: t("bibliography sources zotero bib settings"),
        run: () => useSettingsStore.getState().openSettings("bibliography"),
      },
      {
        id: "settings",
        title: t("Settings…"),
        icon: Settings,
        keywords: t("preferences theme language spellcheck"),
        run: () => useSettingsStore.getState().setSettingsDialogOpen(true),
      },
      {
        id: "account",
        title: t("Scholarkit account…"),
        icon: UserRound,
        keywords: t("sign in sign out login logout plan free plus pro server"),
        run: () => useSettingsStore.getState().openSettings("account"),
      },
      {
        id: "shortcuts",
        title: t("Keyboard shortcuts"),
        icon: Keyboard,
        shortcut: formatShortcut("Mod+Alt+/"),
        run: () => useDialogsStore.getState().setShortcutsOpen(true),
      },
      {
        id: "about",
        title: t("About Polemic"),
        icon: Sparkles,
        run: () => useDialogsStore.getState().setAboutOpen(true),
      },
    ];

    if (!project) return app;

    const store = useProjectStore.getState();
    return [
      {
        id: "save",
        title: t("Save"),
        icon: Save,
        shortcut: formatShortcut("Mod+S"),
        run: () => void store.saveActiveFile(),
      },
      {
        id: "format",
        title: t("Format document"),
        icon: WandSparkles,
        shortcut: formatShortcut("Shift+Alt+F"),
        run: () => formatDocument(),
      },
      {
        id: "compile",
        title: t("Compile"),
        icon: Play,
        shortcut: formatShortcut("Mod+Shift+R"),
        run: () => void usePreviewStore.getState().compileNow(),
      },
      {
        id: "export-pdf",
        title: t("Export PDF…"),
        icon: FileText,
        shortcut: formatShortcut("Mod+E"),
        run: () => void exportPdfAs(),
      },
      {
        id: "close-project",
        title: t("Close project"),
        icon: FolderOpen,
        shortcut: formatShortcut("Mod+Shift+W"),
        keywords: t("new switch projects view"),
        run: () => void store.leaveProject(),
      },
      {
        id: "reveal-build",
        title: t("Reveal build folder"),
        icon: FolderOpen,
        run: () => void revealBuildFolder(project.path),
      },
      {
        id: "toggle-line-comment",
        title: t("Toggle line comment"),
        icon: Percent,
        shortcut: formatShortcut("Mod+/"),
        keywords: t("comment out uncomment percent code"),
        run: () => runEditorCommand("toggle-comment"),
      },
      {
        id: "add-comment",
        title: t("Add comment"),
        icon: MessageSquare,
        shortcut: formatShortcut("Mod+Alt+C"),
        keywords: t("note annotation review"),
        run: () => addCommentAtCursor(),
      },
      {
        id: "add-file-comment",
        title: t("Add comment on file"),
        icon: MessageSquare,
        keywords: t("note annotation file"),
        run: () => addFileComment(),
      },
      {
        id: "toggle-sidebar",
        title: t("Toggle navigator"),
        icon: PanelLeft,
        shortcut: formatShortcut("Mod+Alt+B"),
        keywords: t("sidebar files outline symbols hide show"),
        run: () => runPanelCommand("toggle-sidebar"),
      },
      {
        id: "toggle-preview",
        title: t("Toggle PDF preview"),
        icon: PanelRight,
        shortcut: formatShortcut("Mod+Shift+P"),
        keywords: t("pdf hide show"),
        run: () => runPanelCommand("toggle-preview"),
      },
      {
        id: "toggle-right",
        title: t("Toggle properties"),
        icon: PanelRight,
        shortcut: formatShortcut("Mod+J"),
        keywords: t("right panel git snapshots history comments hide show"),
        run: () => runPanelCommand("toggle-right"),
      },
      {
        id: "toggle-search",
        title: t("Find in project"),
        icon: Search,
        shortcut: formatShortcut("Mod+Shift+F"),
        keywords: t("find grep across files"),
        run: () => runPanelCommand("toggle-search"),
      },
      {
        id: "toggle-issues",
        title: t("Toggle issues"),
        icon: AlertTriangle,
        shortcut: formatShortcut("Mod+Shift+M"),
        keywords: t("errors warnings problems hide show"),
        run: () => runPanelCommand("toggle-issues"),
      },
      {
        id: "toggle-log",
        title: t("Toggle compile log"),
        icon: ScrollText,
        keywords: t("latexmk output hide show"),
        run: () => runPanelCommand("toggle-log"),
      },
      {
        id: "insert-table",
        title: t("Insert table…"),
        icon: TableProperties,
        shortcut: formatShortcut("Mod+Shift+T"),
        keywords: t("tabular booktabs rows columns skeleton"),
        run: () => useDialogsStore.getState().setTableDialogOpen(true),
      },
      {
        id: "csv-import",
        title: t("Table or plot from CSV…"),
        icon: TableProperties,
        keywords: t("csv data import spreadsheet pgfplots plot chart booktabs"),
        run: () => useDialogsStore.getState().setCsvImport({ path: null }),
      },
      {
        id: "packages",
        title: t("Packages…"),
        icon: Package,
        shortcut: formatShortcut("Mod+Alt+P"),
        keywords: t("ctan usepackage libraries install latex"),
        run: () => useDialogsStore.getState().setPackagesDialogOpen(true),
      },
      {
        id: "wrap-figure",
        title: t("Figure from image…"),
        icon: Image,
        shortcut: formatShortcut("Mod+Alt+G"),
        keywords: t("wrap includegraphics caption float graphic"),
        run: () => wrapFigure(),
      },
      {
        id: "insert-citation",
        title: t("Insert citation…"),
        icon: Quote,
        shortcut: formatShortcut("Mod+Shift+C"),
        keywords: t("cite reference bibliography"),
        run: () => insertWithCompletion("\\cite{}", 6),
      },
      {
        id: "insert-reference",
        title: t("Insert reference…"),
        icon: Link,
        keywords: t("ref label cross-reference"),
        run: () => insertWithCompletion("\\ref{}", 5),
      },
      {
        id: "insert-footnote",
        title: t("Insert footnote"),
        icon: Superscript,
        run: () => insertAtCursor("\\footnote{}", 10),
      },
      {
        id: "insert-display-math",
        title: t("Insert display math"),
        icon: Sigma,
        keywords: t("equation formula"),
        run: () => insertAtCursor("\\[\n  \n\\]", "\\[\n  ".length),
      },
      {
        id: "document-settings",
        title: t("Document settings…"),
        icon: FileCog,
        keywords: t("class paper title author"),
        run: () => useDialogsStore.getState().setDocumentSettingsOpen(true),
      },
      {
        id: "share",
        title: t("Share…"),
        icon: Share2,
        keywords: t("publish review link reviewer supervisor"),
        run: () => useDialogsStore.getState().setShareOpen(true),
      },
      {
        id: "commit",
        title: versionControl === "git" ? t("Commit…") : t("Show snapshots"),
        icon: GitBranch,
        shortcut: formatShortcut("Mod+K"),
        keywords: t("git version control history"),
        run: () => runPanelCommand("show-version-control"),
      },
      ...TIKZ_SNIPPETS.map((snippet) => ({
        id: `tikz-${snippet.id}`,
        title: snippet.title,
        icon: Shapes,
        keywords: snippet.keywords,
        run: () => insertTikzSnippet(snippet.id),
      })),
      ...(versionControl === "snapshots"
        ? [
            {
              id: "snapshot",
              title: t("Take snapshot"),
              icon: Camera,
              keywords: t("backup version save"),
              run: () => void useProjectStore.getState().takeSnapshot(),
            },
          ]
        : []),
      {
        id: "toggle-autocompile",
        title: usePreviewStore.getState().autoCompile
          ? t("Turn auto-compile off")
          : t("Turn auto-compile on"),
        icon: Zap,
        run: () => usePreviewStore.getState().toggleAutoCompile(),
      },
      ...app,
    ];
  }, [project, versionControl]);

  const fileCommands = useMemo<Command[]>(() => {
    if (!project) return [];
    return collectFilePaths(files).map((path) => ({
      id: `open:${path}`,
      title: t("Open: {path}", { path }),
      icon: FileText,
      keywords: t("go to switch tab"),
      run: () => void useProjectStore.getState().openFile(path),
    }));
  }, [files, project]);

  const results = useMemo(() => {
    const all = [...commands, ...fileCommands].filter(
      (command) => !HIDDEN_COMMANDS.has(command.id),
    );
    if (!query.trim()) return all.map((item) => ({ item, score: 0, indices: [] }));
    return fuzzyRank(
      query,
      all,
      (command) => [command.title, command.keywords ?? ""],
      20,
    );
  }, [commands, fileCommands, query]);

  useEffect(() => {
    if (selected >= results.length) {
      // Keep the selection in range as the result list shrinks.
      const timeout = setTimeout(() => setSelected(Math.max(0, results.length - 1)));
      return () => clearTimeout(timeout);
    }
  }, [results.length, selected]);

  function accept(result: FuzzyItem<Command> | undefined) {
    if (!result) return;
    onClose();
    result.item.run();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      accept(results[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  // Keep the selected item visible while navigating with the keyboard.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[data-selected="true"]');
    item?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/30 pt-[15vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={t("Command palette")}
        className="h-fit w-[min(560px,calc(100%-2rem))] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("Type a command or file name…")}
          className="w-full border-b bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("No matching commands.")}
            </p>
          )}
          {results.map((result, index) => {
            const command = result.item;
            const Icon = command.icon;
            const isSelected = index === selected;
            return (
              <button
                key={command.id}
                type="button"
                data-selected={isSelected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm",
                  isSelected ? "bg-primary/10" : "hover:bg-muted",
                )}
                onMouseMove={() => setSelected(index)}
                onClick={() => accept(result)}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{command.title}</span>
                {command.shortcut && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {command.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
