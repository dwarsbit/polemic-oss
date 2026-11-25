import { errorText } from "@/lib/error-text";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Cloud,
  FolderOpen,
  GitBranch,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  createProject,
  deleteProject,
  getSettings,
  gitCloneProject,
  listTemplates,
  openProjectDialog,
  projectNameFromRemote,
  renameProject,
  setPinnedProject,
  texPackageInfo,
  type Settings,
  type TemplateInfo,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { PolemicMark } from "@/components/PolemicLogo";
import { useDialogsStore } from "@/store/dialogs";
import { useProjectStore } from "@/store/project";
import { features } from "@/lib/target";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";

/** Journal and conference templates share one segment with a menu, so
 *  the picker keeps the general-purpose templates up front. */
const PUBLISHER_TEMPLATES = ["acm", "ieee", "lncs", "elsevier"];

type ActionDialog =
  | { kind: "none" }
  | { kind: "rename"; path: string; name: string }
  | { kind: "delete"; path: string; name: string }
  | { kind: "clone" };

export function ProjectsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionDialog>({ kind: "none" });
  const [cloneUrl, setCloneUrl] = useState("");
  // The clone's project name: taken from the URL until the user types one.
  const [cloneName, setCloneName] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateId, setTemplateId] = useState("article");
  // Packages the chosen template needs but the TeX distribution lacks.
  const [missing, setMissing] = useState<{ id: string; packages: string[] } | null>(
    null,
  );
  const openProject = useProjectStore((s) => s.openProject);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getSettings()
      .then(setSettings)
      .catch((e) => {
        setError(errorText(e));
        setLoadFailed(true);
      });
    void listTemplates()
      .then(setTemplates)
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    const requires = templates.find((t) => t.id === templateId)?.requires ?? [];
    if (requires.length === 0) return;
    let cancelled = false;
    void texPackageInfo(requires.map((r) => r.file))
      .then((infos) => {
        if (cancelled) return;
        const packages = requires
          .filter((_, i) => infos[i]?.installed === false)
          .map((r) => r.package);
        setMissing({ id: templateId, packages: [...new Set(packages)] });
      })
      .catch(() => {
        // No TeX tools to ask: say nothing.
      });
    return () => {
      cancelled = true;
    };
  }, [templates, templateId]);
  const missingPackages =
    missing !== null && missing.id === templateId ? missing.packages : [];

  async function refresh() {
    try {
      setSettings(await getSettings());
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function handleCreate() {
    setError(null);
    setBusy(true);
    try {
      const info = await createProject(name, templateId);
      await openProject(info.path);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  /** The browser build: a new project from a zip's files. */
  async function handleUploadZip() {
    setError(null);
    const [{ pickFiles }, { importProjectZip }] = await Promise.all([
      import("@/web/uploads"),
      import("@/web/projects"),
    ]);
    const [zip] = await pickFiles({ multiple: false, accept: ".zip" });
    if (!zip) return;
    setBusy(true);
    try {
      const info = await importProjectZip(
        name.trim() || zip.name.replace(/\.zip$/i, ""),
        zip,
      );
      await openProject(info.path);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(path: string) {
    setError(null);
    try {
      await openProject(path);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function handleOpenFolder() {
    setError(null);
    try {
      // The dialog runs Rust-side: only a folder the user picked is admitted.
      const info = await openProjectDialog();
      if (info !== null) await handleOpen(info.path);
    } catch (e) {
      setError(errorText(e));
    }
  }

  const projects = settings
    ? [...settings.recentProjects].sort((a, b) => {
        const aPinned = settings.pinnedProjects.includes(a.path) ? 0 : 1;
        const bPinned = settings.pinnedProjects.includes(b.path) ? 0 : 1;
        return aPinned - bPinned;
      })
    : [];

  const effectiveCloneName = cloneName ?? projectNameFromRemote(cloneUrl);
  const canClone = cloneUrl.trim() !== "" && effectiveCloneName.trim() !== "" && !busy;

  async function confirmAction() {
    setError(null);
    try {
      if (action.kind === "rename") {
        await renameProject(action.path, newName);
        await refresh();
      } else if (action.kind === "delete") {
        setSettings(await deleteProject(action.path));
      } else if (action.kind === "clone") {
        setBusy(true);
        try {
          const info = await gitCloneProject(cloneUrl, effectiveCloneName);
          setAction({ kind: "none" });
          await openProject(info.path);
        } finally {
          setBusy(false);
        }
        return;
      }
      setAction({ kind: "none" });
    } catch (e) {
      setError(errorText(e));
    }
  }

  const publisherTemplates = templates.filter((t) =>
    PUBLISHER_TEMPLATES.includes(t.id),
  );
  const selectedPublisher = publisherTemplates.find((t) => t.id === templateId);

  const general = templates.filter((t) => !PUBLISHER_TEMPLATES.includes(t.id));

  return (
    <div className="relative flex h-full flex-col items-center overflow-y-auto px-4 pt-[max(1.75rem,4vh)] pb-16 text-foreground">
      <h1 className="mb-5 flex shrink-0 flex-col items-center gap-2.5 text-[17px] font-semibold">
        <PolemicMark className="size-11" />
        {t("New Polemic project")}
      </h1>
      <div className="w-full max-w-[480px] shrink-0 rounded-xl border bg-card p-5 shadow-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            // An empty name has nothing to create: point at the field.
            if (name.trim() === "") nameInput.current?.focus();
            else void handleCreate();
          }}
        >
          <Input
            ref={nameInput}
            autoFocus
            className="h-9"
            placeholder={t("Project name")}
            aria-label={t("Project name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {templates.length > 0 && (
            <>
              <div
                role="radiogroup"
                aria-label={t("Template")}
                className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {general.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={templateId === template.id}
                    title={template.description}
                    className={TILE}
                    onClick={() => setTemplateId(template.id)}
                  >
                    <TilePreview look={lookOf(template.id)} />
                    <span className="truncate px-0.5">{template.name}</span>
                  </button>
                ))}
                {publisherTemplates.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selectedPublisher !== undefined}
                        title={selectedPublisher?.description}
                        className={TILE}
                      >
                        <TilePreview look="page" />
                        <span className="flex min-w-0 items-center gap-1 px-0.5">
                          <span className="truncate">
                            {selectedPublisher?.name ?? t("Publisher…")}
                          </span>
                          <ChevronDown className="size-3 flex-none opacity-60" />
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <DropdownMenuRadioGroup
                        value={selectedPublisher?.id ?? ""}
                        onValueChange={setTemplateId}
                      >
                        {publisherTemplates.map((template) => (
                          <DropdownMenuRadioItem
                            key={template.id}
                            value={template.id}
                            title={template.description}
                          >
                            {template.name}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {missingPackages.length > 0 && (
                <p className="mt-2 text-xs text-warning">
                  {rich(
                    "This template needs {packages}, which your TeX distribution lacks. With TeX Live, install them with <0>{command}</0>. MiKTeX installs them on the first compile.",
                    [(c) => <code className="font-mono">{c}</code>],
                    {
                      packages: missingPackages.join(", "),
                      command: `tlmgr install ${missingPackages.join(" ")}`,
                    },
                  )}
                </p>
              )}
            </>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-4 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              {features.localFiles ? (
                <>
                  <button
                    type="button"
                    className={FOOT_LINK}
                    onClick={() => void handleOpenFolder()}
                  >
                    <FolderOpen aria-hidden />
                    {t("Open folder…")}
                  </button>
                  <button
                    type="button"
                    className={FOOT_LINK}
                    title={t("Clone a Git repository into a new project")}
                    onClick={() => {
                      setError(null);
                      setCloneUrl("");
                      setCloneName(null);
                      setAction({ kind: "clone" });
                    }}
                  >
                    <GitBranch aria-hidden />
                    {t("Clone from Git…")}
                  </button>
                  <button
                    type="button"
                    className={FOOT_LINK}
                    title={t(
                      "Open a project from your Scholarkit account, made in your browser or on another computer",
                    )}
                    onClick={() =>
                      useDialogsStore.getState().setAccountProjects({ projectId: null })
                    }
                  >
                    <Cloud aria-hidden />
                    {t("Open from your account…")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={FOOT_LINK}
                  title={t(
                    "Make a project from the files in a zip, named as above or after the zip",
                  )}
                  disabled={busy}
                  onClick={() => void handleUploadZip()}
                >
                  <Upload aria-hidden />
                  {t("Upload a zip…")}
                </button>
              )}
            </div>
            <Button type="submit" disabled={busy}>
              {t("Create")}
            </Button>
          </div>
        </form>
        {features.localFiles && (
          <section className="mt-5">
            <h2 className="mb-1.5 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
              {t("Recent")}
            </h2>
            {settings === null ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                {loadFailed ? t("Couldn't load your projects.") : t("Loading…")}
              </p>
            ) : projects.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                {t("No projects yet. Create one above or open a folder.")}
              </p>
            ) : (
              <ul className="-mx-1 space-y-0.5">
                {projects.map((project) => {
                  const pinned = settings.pinnedProjects.includes(project.path);
                  return (
                    <li
                      key={project.path}
                      className="group relative flex items-center rounded-md hover:bg-muted"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-baseline gap-3 px-2.5 py-1.5 text-left"
                        title={features.localFiles ? project.path : undefined}
                        onClick={() => void handleOpen(project.path)}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm">
                            {pinned && (
                              <Pin className="mr-1 inline size-3 -rotate-45 text-muted-foreground" />
                            )}
                            {project.name}
                          </span>
                          {project.detail && (
                            <span className="truncate text-xs text-muted-foreground">
                              {project.detail}
                            </span>
                          )}
                        </span>
                        {project.openedAt !== undefined && (
                          <span className="shrink-0 text-2xs text-muted-foreground group-focus-within:invisible group-hover:invisible">
                            {formatOpened(project.openedAt)}
                          </span>
                        )}
                      </button>
                      {/* Over the date on hover, so the row keeps its height. */}
                      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={pinned ? t("Unpin project") : t("Pin project")}
                          onClick={() => {
                            void setPinnedProject(project.path, !pinned).then(refresh);
                          }}
                        >
                          {pinned ? <PinOff /> : <Pin />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t("Rename project")}
                          onClick={() => {
                            setNewName(project.name);
                            setAction({ kind: "rename", ...project });
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="hover:text-destructive"
                          title={
                            features.localFiles
                              ? t("Move project to trash")
                              : t("Delete project")
                          }
                          onClick={() => setAction({ kind: "delete", ...project })}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
      {!features.localFiles && (
        <p className="mt-3.5 shrink-0 text-center text-xs text-muted-foreground">
          {rich("Your projects are on <0>the Scholarkit home</0>.", [
            (text) => (
              <a
                href="/"
                className="text-foreground underline underline-offset-2 hover:no-underline"
              >
                {text}
              </a>
            ),
          ])}
        </p>
      )}

      <Dialog
        open={action.kind !== "none"}
        onOpenChange={(open) => {
          if (!open) setAction({ kind: "none" });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action.kind === "rename"
                ? t("Rename project")
                : action.kind === "clone"
                  ? t("Clone repository")
                  : t("Delete project")}
            </DialogTitle>
          </DialogHeader>
          {action.kind === "rename" ? (
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim() !== "") void confirmAction();
              }}
            />
          ) : action.kind === "delete" ? (
            features.localFiles ? (
              <p className="text-sm">
                {rich(
                  "Move <0>{name}</0> to the trash? You can restore it from there until you empty the trash.",
                  [(c) => <span className="font-medium">{c}</span>],
                  { name: action.name },
                )}
              </p>
            ) : (
              <p className="text-sm">
                {rich(
                  "Delete <0>{name}</0> with its files, comments and review links? This can't be undone.",
                  [(c) => <span className="font-medium">{c}</span>],
                  { name: action.name },
                )}
              </p>
            )
          ) : action.kind === "clone" ? (
            <div className="flex flex-col gap-2">
              <Input
                autoFocus
                placeholder="https://github.com/you/paper.git"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canClone) void confirmAction();
                }}
              />
              <Input
                placeholder={t("Project name")}
                value={effectiveCloneName}
                onChange={(e) => setCloneName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canClone) void confirmAction();
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "The repository is cloned into your projects folder. A private repository needs a git account in Settings, or an SSH key.",
                )}
              </p>
            </div>
          ) : null}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction({ kind: "none" })}>
              {t("Cancel")}
            </Button>
            <Button
              variant={action.kind === "delete" ? "destructive" : "default"}
              disabled={
                (action.kind === "rename" && newName.trim() === "") ||
                (action.kind === "clone" && !canClone)
              }
              onClick={() => void confirmAction()}
            >
              {action.kind === "delete"
                ? features.localFiles
                  ? t("Move to trash")
                  : t("Delete")
                : action.kind === "clone"
                  ? busy
                    ? t("Cloning…")
                    : t("Clone")
                  : t("Rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One segment of the template picker. */
/** A template's tile, as in Binder and Cursive: a small drawing and its name. */
const TILE =
  "group flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-1.5 pb-2 text-left text-xs font-medium outline-none hover:border-foreground/20 focus-visible:border-ring aria-checked:border-primary aria-checked:shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_14%,transparent)]";

/** A quiet action at the foot of the card, such as Open folder…, with its icon. */
const FOOT_LINK =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5";

type TileLook = "blank" | "page" | "slides";

const lookOf = (id: string): TileLook =>
  id === "blank" ? "blank" : id === "beamer" ? "slides" : "page";

/** A small drawing of a page, a deck or nothing, for a tile. */
function TilePreview({ look }: { look: TileLook }) {
  const line = "absolute h-[3px] rounded-full bg-foreground/12";
  return (
    <span
      aria-hidden
      className="relative block h-11 overflow-hidden rounded-[5px] bg-muted group-aria-checked:bg-primary/8"
    >
      {look === "page" && (
        <>
          <span
            className={cn(line, "top-2 right-8 left-2.5 h-[5px] bg-foreground/20")}
          />
          <span className={cn(line, "top-[18px] right-2.5 left-2.5")} />
          <span className={cn(line, "top-[25px] right-5 left-2.5")} />
          <span className={cn(line, "top-8 right-7 left-2.5")} />
        </>
      )}
      {look === "slides" && (
        <>
          <span
            className={cn(line, "top-[15px] right-4 left-4 h-[5px] bg-foreground/20")}
          />
          <span className={cn(line, "top-[25px] right-6 left-6")} />
        </>
      )}
    </span>
  );
}

/** "Today", "Yesterday", "Oct 28", or "Oct 28, 2025" in another year. */
export function formatOpened(time: number, now = new Date()): string {
  const date = new Date(time);
  const day = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return t("Today");
  if (days === 1) return t("Yesterday");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
