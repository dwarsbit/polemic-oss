import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, RefreshCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectTex } from "@/lib/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";

function StatusRow({
  label,
  found,
  hint,
}: {
  label: string;
  found: boolean | null;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      {found === null ? (
        <span className="mt-0.5 size-4 shrink-0" />
      ) : found ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div>
        <span className="text-sm font-medium">{label}</span>
        {!found && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function LinkButton({ url, label }: { url: string; label: string }) {
  return (
    <Button
      variant="link"
      className="h-auto p-0 text-xs"
      onClick={() => void openUrl(url)}
    >
      {label}
      <ExternalLink className="size-3" />
    </Button>
  );
}

export function TexStatusSection() {
  const queryClient = useQueryClient();
  const { data: tex } = useQuery({
    queryKey: ["tex-status"],
    queryFn: detectTex,
    staleTime: Infinity,
  });

  return (
    <div>
      <p className="mb-1.5 font-medium">{t("TeX distribution")}</p>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {rich(
          "Polemic compiles on your machine using your own TeX installation. It needs <0>pdflatex</0> and <1>latexmk</1> on your PATH (<2>xelatex</2> or <3>lualatex</3> for projects set to those engines); <4>synctex</4> enables click navigation.",
          [
            (c) => <span className="font-mono">{c}</span>,
            (c) => <span className="font-mono">{c}</span>,
            (c) => <span className="font-mono">{c}</span>,
            (c) => <span className="font-mono">{c}</span>,
            (c) => <span className="font-mono">{c}</span>,
          ],
        )}
      </p>
      <div className="my-2">
        {tex === undefined ? (
          <p className="text-sm text-muted-foreground">{t("Detecting…")}</p>
        ) : tex === null ? (
          <p className="text-sm text-muted-foreground">
            {t("Detection is unavailable (not running in the desktop app).")}
          </p>
        ) : (
          <>
            <StatusRow
              label="pdflatex"
              found={tex.pdflatex.found}
              hint={tex.pdflatex.version ?? undefined}
            />
            <StatusRow
              label="xelatex"
              found={tex.xelatex.found}
              hint={tex.xelatex.version ?? t("optional, for fontspec documents")}
            />
            <StatusRow
              label="lualatex"
              found={tex.lualatex.found}
              hint={tex.lualatex.version ?? "optional"}
            />
            <StatusRow
              label="latexmk"
              found={tex.latexmk.found}
              hint={tex.latexmk.version ?? undefined}
            />
          </>
        )}
      </div>
      <div className="space-y-2 rounded border p-3 text-sm">
        <p className="font-medium">{t("Install a distribution")}</p>
        <p>
          {t("macOS: MacTeX includes pdflatex, latexmk, and synctex.")}{" "}
          <LinkButton url="https://www.tug.org/mactex/" label="tug.org/mactex" />
        </p>
        <p>
          {rich(
            "Linux: TeX Live from your package manager (e.g. <0>sudo apt install texlive-full</0>).",
            [(c) => <span className="font-mono">{c}</span>],
          )}{" "}
          <LinkButton url="https://tug.org/texlive/" label="tug.org/texlive" />
        </p>
        <p>
          {t("Windows: MiKTeX installs packages on demand; latexmk comes with it.")}{" "}
          <LinkButton url="https://miktex.org/" label="miktex.org" />
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            "After installing, reopen the terminal so the new PATH is picked up, then re-check.",
          )}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => void queryClient.invalidateQueries({ queryKey: ["tex-status"] })}
      >
        <RefreshCcw />
        {t("Re-check")}
      </Button>
    </div>
  );
}
