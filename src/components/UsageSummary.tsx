import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { t } from "@scholarkit/i18n";

/** GET /api/usage, the parts shown here. */
interface Usage {
  storage: { usedBytes: number; limitBytes: number };
  compile: { usedPercent: number };
}

/** Decimal units, as the plans state them: "100 MB", "5 GB". */
export function formatStorage(bytes: number): string {
  const units: [number, string][] = [
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "KB"],
  ];
  for (const [size, unit] of units) {
    if (bytes >= size) return `${Number((bytes / size).toFixed(1))} ${unit}`;
  }
  return `${bytes} B`;
}

/** The share of today's cloud compile used, as every account view says it: "40% used". */
export function formatCompileUsed(percent: number): string {
  return `${percent}% used`;
}

/**
 * The browser build's note under the project list: storage and today's
 * the share of today's cloud compile used, with a link to the account page.
 */
export function UsageSummary() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let live = true;
    void import("@/web/server")
      .then(({ request }) => request<Usage>("/api/usage"))
      .then((answer) => {
        if (live) setUsage(answer);
      })
      .catch(() => {
        // Not worth an error on the start screen.
      });
    return () => {
      live = false;
    };
  }, []);

  if (usage === null) return null;
  const { storage, compile } = usage;
  const full = storage.usedBytes >= storage.limitBytes;
  const compileUsedUp = compile.usedPercent >= 100;
  return (
    <p className="mt-4 text-xs text-muted-foreground">
      <span className={cn(full && "text-warning")}>
        {full ? t("Your storage is full") : t("Storage")}
        {t(": {formatStorage} of {formatStorage2}.", {
          formatStorage: formatStorage(storage.usedBytes),
          formatStorage2: formatStorage(storage.limitBytes),
        })}
      </span>{" "}
      <span className={cn(compileUsedUp && "text-warning")}>
        {compileUsedUp
          ? t("Cloud compile is used up for today.")
          : t("Cloud compile today: {formatCompileUsed}.", {
              formatCompileUsed: formatCompileUsed(compile.usedPercent),
            })}
      </span>{" "}
      <a
        href="/account"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {t("See your plan")}
      </a>
    </p>
  );
}
