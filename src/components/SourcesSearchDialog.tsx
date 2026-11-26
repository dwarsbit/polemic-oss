import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Sparkles } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  entryTitle,
  formatEntry,
  parseBibEntries,
  type BibEntry,
} from "@/lib/bib-entries";
import { fuzzyMatch } from "@/lib/fuzzy";
import { appendBibEntryToProject, projectBibKeys } from "@/lib/project-bib";
import {
  zoteroItemToBib,
  zoteroCreators,
  type ZoteroItemData,
} from "@/lib/zotero-convert";
import { zoteroLocalSearch, zoteroWebSearch } from "@/lib/zotero";
import {
  paperDetails,
  paperEntry,
  PaperSearchError,
  searchPapers,
  type FoundPaper,
} from "@/lib/paper-search";
import { isWeb } from "@/lib/target";
import { useAccountStore } from "@/store/account";
import { sourceName, useSourcesStore, type SourceDef } from "@/store/sources";
import { useSettingsStore } from "@/store/settings";
import { cn } from "cn";
import { t } from "@scholarkit/i18n";

interface BibHit {
  source: SourceDef;
  entry: BibEntry;
  file: string;
}

interface ZoteroHit {
  source: SourceDef;
  item: ZoteroItemData;
}

/** Papers from OpenAlex for these words, or why there are none. */
interface PaperHits {
  query: string;
  works: FoundPaper[];
  betterWithPro: boolean;
  /** `plus_needed`, or a message to show; null when the search worked. */
  stopped: { code: string; message: string } | null;
}

/** Papers are searched for once there are this many characters, and typing pauses. */
const PAPER_MIN_CHARS = 3;

/**
 * "Add from Sources…": search every enabled source and copy picked
 * references into the project's bibliography. Bib sources read their
 * cached files; Zotero sources are queried live. Stays open for
 * batch adds; keys are deduped against the project.
 */
export function SourcesSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sources = useSourcesStore((s) => s.sources);
  const sourceFiles = useSourcesStore((s) => s.sourceFiles);
  const bibTexts = useSourcesStore((s) => s.bibTexts);
  const projectNames = useSourcesStore((s) => s.projectNames);
  const error = useSourcesStore((s) => s.error);

  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [zoteroHits, setZoteroHits] = useState<ZoteroHit[]>([]);
  const [paperHits, setPaperHits] = useState<PaperHits | null>(null);
  const account = useAccountStore((s) => s.status);
  const signedIn = isWeb || account?.signedIn === true;

  /** The plans on the account page: on this site in the browser, in the browser from the desktop app. */
  const openPlans = () => {
    if (isWeb) window.location.assign("/account#plan");
    else if (account) void openUrl(`${account.server}/account#plan`);
  };

  // Papers from OpenAlex, through the Scholarkit server, once typing pauses.
  const paperWords = query.trim();
  const wantsPapers = open && signedIn && paperWords.length >= PAPER_MIN_CHARS;
  useEffect(() => {
    if (!wantsPapers) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPapers(paperWords)
        .then((answer) => {
          if (!cancelled)
            setPaperHits({
              query: paperWords,
              works: answer.works,
              betterWithPro: Boolean(answer.betterWithPro),
              stopped: null,
            });
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          // Signed out or offline: no papers, and nothing to say about it.
          const quiet = !(e instanceof PaperSearchError) || e.status === 401;
          setPaperHits({
            query: paperWords,
            works: [],
            betterWithPro: false,
            stopped: quiet ? null : { code: e.code, message: e.message },
          });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wantsPapers, paperWords]);
  const papers = wantsPapers && paperHits?.query === paperWords ? paperHits : null;

  // Refresh the sources scan while the dialog is open.
  useEffect(() => {
    if (open) void useSourcesStore.getState().refresh();
  }, [open]);

  const bibSources = useMemo(
    () => sources.filter((s) => s.kind === "bib" && s.enabled),
    [sources],
  );
  const zoteroSources = useMemo(
    () =>
      sources.filter(
        (s) =>
          s.enabled &&
          (s.kind === "zotero-app" ||
            (s.kind === "zotero-cloud" &&
              (s.userId ?? "").length > 0 &&
              (s.apiKey ?? "").length > 0)),
      ),
    [sources],
  );

  // Live Zotero search (debounced), across every enabled connection.
  useEffect(() => {
    const trimmed = query.trim();
    const eligible = open && trimmed.length > 0 && zoteroSources.length > 0;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (!eligible) {
          if (!cancelled) setZoteroHits([]);
          return;
        }
        const requests = await Promise.allSettled(
          zoteroSources.map((source) =>
            source.kind === "zotero-app"
              ? zoteroLocalSearch(trimmed, null)
              : zoteroWebSearch(trimmed, null, source),
          ),
        );
        if (cancelled) return;
        const hits: ZoteroHit[] = [];
        requests.forEach((request, index) => {
          if (request.status !== "fulfilled") return;
          for (const item of request.value) {
            hits.push({ source: zoteroSources[index], item });
          }
        });
        setZoteroHits(hits);
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, zoteroSources]);

  const bibHits = useMemo<BibHit[]>(() => {
    const q = query.trim();
    const out: BibHit[] = [];
    for (const source of bibSources) {
      for (const file of sourceFiles[source.id] ?? []) {
        for (const entry of parseBibEntries(bibTexts[file] ?? "").entries) {
          if (
            q.length === 0 ||
            fuzzyMatch(q, `${entry.key} ${entryTitle(entry)}`) !== null
          ) {
            out.push({ source, entry, file });
          }
        }
      }
    }
    return out.sort((a, b) => a.entry.key.localeCompare(b.entry.key));
  }, [bibSources, sourceFiles, bibTexts, query]);

  async function addBib(hit: BibHit) {
    const raw = (bibTexts[hit.file] ?? "").slice(hit.entry.from, hit.entry.to);
    const result = await appendBibEntryToProject(raw, hit.entry.key);
    if (result === null) return;
    setAdded((prev) => new Set([...prev, hit.entry.key]));
    setMessage(
      result.alreadyPresent
        ? t("{key} is already in the project.", { key: hit.entry.key })
        : t("Added {key} to {target}.", { key: hit.entry.key, target: result.target }),
    );
  }

  async function addZotero(hit: ZoteroHit) {
    const taken = await projectBibKeys();
    const bib = zoteroItemToBib(hit.item, taken);
    const raw = formatEntry(bib.type, bib.key, bib.fields);
    const result = await appendBibEntryToProject(raw, bib.key);
    if (result === null) return;
    setAdded((prev) => new Set([...prev, hit.item.key ?? bib.key]));
    setMessage(
      result.alreadyPresent
        ? t("{key} is already in the project.", { key: bib.key })
        : t("Added {key} to {target}.", { key: bib.key, target: result.target }),
    );
  }

  async function addPaper(paper: FoundPaper) {
    const work = await paperDetails(paper);
    const taken = await projectBibKeys();
    const entry = paperEntry(work, taken);
    const result = await appendBibEntryToProject(entry.raw, entry.key);
    if (result === null) return;
    setAdded((prev) => new Set([...prev, paper.openAlexId || entry.key]));
    setMessage(
      result.alreadyPresent
        ? t("{key} is already in the project.", { key: entry.key })
        : t("Added {key} to {target}.", { key: entry.key, target: result.target }),
    );
  }

  /** One section per source, in the configured order. */
  const sections = useMemo(() => {
    const zoteroBySource = new Map<string, ZoteroHit[]>();
    for (const hit of zoteroHits) {
      const list = zoteroBySource.get(hit.source.id);
      if (list === undefined) zoteroBySource.set(hit.source.id, [hit]);
      else list.push(hit);
    }
    const bibBySource = new Map<string, BibHit[]>();
    for (const hit of bibHits) {
      const list = bibBySource.get(hit.source.id);
      if (list === undefined) bibBySource.set(hit.source.id, [hit]);
      else list.push(hit);
    }
    return sources
      .filter(
        (source) =>
          (bibBySource.get(source.id)?.length ?? 0) > 0 ||
          (zoteroBySource.get(source.id)?.length ?? 0) > 0,
      )
      .map((source) => ({
        source,
        bib: bibBySource.get(source.id) ?? [],
        zotero: zoteroBySource.get(source.id) ?? [],
      }));
  }, [sources, bibHits, zoteroHits]);

  const trim = query.trim();
  const anySource = bibSources.length > 0 || zoteroSources.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Add from Sources")}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-7 rounded-md pl-6 text-xs"
            placeholder={t("Search your sources")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {error !== null ? (
            <p className="p-2 text-xs text-destructive" title={error}>
              {error}
            </p>
          ) : !anySource ? (
            <div className="p-2">
              <p className="text-xs text-muted-foreground">
                {t("No sources are available. Add or enable one in Settings.")}
              </p>
              <Button
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  useSettingsStore.getState().openSettings("bibliography");
                }}
              >
                {t("Open Settings")}
              </Button>
            </div>
          ) : (
            <>
              {sections.length === 0 && !papers?.works.length && (
                <p className="p-2 text-xs text-muted-foreground">
                  {trim.length > 0
                    ? t("No references match your search.")
                    : t("Type in the search field to search your sources.")}
                </p>
              )}
              {sections.map(({ source, bib, zotero }) => (
                <div key={source.id}>
                  <p className="px-2 pb-1 pt-2 text-2xs font-medium text-muted-foreground">
                    {sourceName(source, projectNames)}
                  </p>
                  <ul className="space-y-0.5 p-1">
                    {bib.slice(0, 50).map((hit) => {
                      const present = added.has(hit.entry.key);
                      return (
                        <li key={`${hit.file}:${hit.entry.key}`}>
                          <HitRow
                            label={hit.entry.key}
                            title={entryTitle(hit.entry)}
                            tag={hit.entry.type}
                            present={present}
                            onClick={() => void addBib(hit)}
                          />
                        </li>
                      );
                    })}
                    {zotero.slice(0, 50).map((hit) => {
                      const id = hit.item.key ?? hit.item.title ?? "";
                      const present = added.has(id);
                      return (
                        <li key={`${source.id}:${id}`}>
                          <HitRow
                            label={zoteroCreators(hit.item.creators?.slice(0, 1))}
                            title={hit.item.title ?? "(untitled)"}
                            tag={hit.item.itemType}
                            present={present}
                            onClick={() => void addZotero(hit)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}
          {papers && (papers.works.length > 0 || papers.stopped) && (
            <div>
              <p className="px-2 pb-1 pt-2 text-2xs font-medium text-muted-foreground">
                {t("Papers from OpenAlex")}
              </p>
              {papers.stopped?.code === "plus_needed" ? (
                <button
                  type="button"
                  className="mx-1 flex w-[calc(100%-0.5rem)] items-start gap-1.5 rounded-md border border-tint-edge bg-muted px-2 py-1.5 text-left text-xs text-tint-foreground"
                  onClick={() => {
                    onOpenChange(false);
                    openPlans();
                  }}
                >
                  <Sparkles className="mt-px size-3 shrink-0" aria-hidden />
                  <span>
                    {t("Find papers by their title or authors with Plus and Pro.")}{" "}
                    <span className="font-medium">{t("See plans")}</span>
                  </span>
                </button>
              ) : papers.stopped ? (
                <p className="p-2 text-xs text-muted-foreground">
                  {papers.stopped.message}
                </p>
              ) : (
                <ul className="space-y-0.5 p-1">
                  {papers.works.map((paper) => {
                    const id = paper.openAlexId || paper.doi || paper.title;
                    return (
                      <li key={id}>
                        <HitRow
                          label={[paper.author[0]?.split(",")[0] ?? "", paper.year]
                            .filter(Boolean)
                            .join(" ")}
                          title={paper.title}
                          tag={paper.container}
                          present={added.has(id)}
                          onClick={() => void addPaper(paper)}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
              {papers.betterWithPro && papers.works.length > 0 && (
                <button
                  type="button"
                  className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-left text-xs font-medium text-tint-foreground hover:underline"
                  onClick={() => {
                    onOpenChange(false);
                    openPlans();
                  }}
                >
                  <Sparkles className="size-3 shrink-0" aria-hidden />
                  {t("Get better results with Pro")}
                </button>
              )}
            </div>
          )}
        </div>
        {message !== null && <p className="text-xs text-muted-foreground">{message}</p>}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("Done")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HitRow({
  label,
  title,
  tag,
  present,
  onClick,
}: {
  label: string;
  title: string;
  tag: string;
  present: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="font-mono">{label}</span>
        {title.length > 0 && (
          <span className="ml-2 text-muted-foreground">{title}</span>
        )}
      </span>
      <span className="shrink-0 text-2xs text-muted-foreground">{tag}</span>
      <span
        className={cn(
          "shrink-0 rounded-full border px-1.5 py-0 text-2xs leading-4",
          present ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {present ? t("in project") : t("add")}
      </span>
      <Plus
        className={cn(
          "size-3 shrink-0",
          present ? "text-muted-foreground" : "text-foreground",
        )}
      />
    </button>
  );
}
