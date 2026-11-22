import { useEffect, useState } from "react";
import { BookOpen, Check, ChevronRight, Folder, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/lib/error-text";
import { getSettings, listBibFiles, type RecentProject } from "@/lib/tauri";
import { useSourcesStore } from "@/store/sources";
import { cn } from "cn";
import { t } from "@scholarkit/i18n";

/** A project's .bib files once loaded, or why they couldn't be. */
type Files =
  | { state: "loading" }
  | { state: "ok"; files: string[] }
  | { state: "error"; message: string };

/**
 * The browser's "BibTeX file from a project…": pick one of your
 * projects and either one .bib file in it or all of them. The source
 * reads the project from your account each time, so it stays current
 * on every device.
 */
export function ProjectBibDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sources = useSourcesStore((s) => s.sources);
  const addSource = useSourcesStore((s) => s.addSource);

  const [projects, setProjects] = useState<RecentProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, Files>>({});
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSettings().then(
      (settings) => {
        if (!cancelled) setProjects(settings.recentProjects);
      },
      (e: unknown) => {
        if (!cancelled) setError(errorText(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open]);

  const taken = new Set(
    sources.flatMap((s) => (s.kind === "bib" && s.path !== null ? [s.path] : [])),
  );

  function toggle(project: RecentProject) {
    const path = project.path;
    setExpanded((current) => (current === path ? null : path));
    if (files[path] !== undefined) return;
    setFiles((prev) => ({ ...prev, [path]: { state: "loading" } }));
    listBibFiles(path).then(
      (list) => setFiles((prev) => ({ ...prev, [path]: { state: "ok", files: list } })),
      (e: unknown) =>
        setFiles((prev) => ({
          ...prev,
          [path]: { state: "error", message: errorText(e) },
        })),
    );
  }

  async function add() {
    if (picked === null) return;
    await addSource({
      kind: "bib",
      enabled: true,
      name: null,
      path: picked,
      userId: null,
      apiKey: null,
    });
    onOpenChange(false);
  }

  function option(path: string, label: string, Icon: typeof BookOpen) {
    const added = taken.has(path);
    return (
      <button
        key={path}
        type="button"
        disabled={added}
        title={added ? t("Already a source") : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent",
          picked === path && "bg-accent font-medium",
        )}
        onClick={() => setPicked(path)}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {(picked === path || added) && <Check className="size-3.5 shrink-0" />}
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Add a BibTeX file from a project")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t(
            "Pick one .bib file, or every .bib file in a project. Polemic reads it from your account each time you search, so your changes to it show up on every device.",
          )}
        </p>
        <div className="max-h-72 min-h-24 overflow-y-auto rounded-md border p-1">
          {error !== null ? (
            <p className="p-2 text-xs text-destructive">{error}</p>
          ) : projects === null ? (
            <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("Loading your projects…")}
            </p>
          ) : projects.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">
              {t("You have no projects yet.")}
            </p>
          ) : (
            projects.map((project) => {
              const isOpen = expanded === project.path;
              const loaded = files[project.path];
              return (
                <div key={project.path}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                    onClick={() => toggle(project)}
                  >
                    <ChevronRight
                      className={cn(
                        "size-3 shrink-0 transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {project.name}
                    </span>
                    {project.detail !== undefined && (
                      <span className="shrink-0 text-2xs text-muted-foreground">
                        {project.detail}
                      </span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="mb-1 pl-5">
                      {loaded === undefined || loaded.state === "loading" ? (
                        <p className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          {t("Loading…")}
                        </p>
                      ) : loaded.state === "error" ? (
                        <p className="px-2 py-1 text-xs text-destructive">
                          {loaded.message}
                        </p>
                      ) : loaded.files.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-muted-foreground">
                          {t("No .bib files in this project.")}
                        </p>
                      ) : (
                        <>
                          {loaded.files.map((file) =>
                            option(file, file.slice(project.path.length + 1), BookOpen),
                          )}
                          {loaded.files.length > 1 &&
                            option(
                              project.path,
                              t("All .bib files in this project"),
                              Folder,
                            )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button size="sm" disabled={picked === null} onClick={() => void add()}>
            {t("Add source")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
