import { MonitorDown } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { desktopProjectUrl, DOWNLOAD_URL } from "@/lib/links";
import { useDialogsStore } from "@/store/dialogs";
import { useProjectStore } from "@/store/project";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";

/** The id in a browser project's path, `/projects/<id>`. */
function projectIdIn(path: string): string | null {
  return /^\/projects\/([^/]+)$/.exec(path)?.[1] ?? null;
}

/**
 * Browser only: takes the open project to the desktop app. The button
 * opens a polemic:// link, which the desktop app answers by asking
 * where to keep the project. A page can't tell whether the app is
 * installed, so the dialog also says what to do when nothing happens.
 */
export function OpenInDesktopDialog() {
  const open = useDialogsStore((s) => s.openInDesktopOpen);
  const setOpen = useDialogsStore((s) => s.setOpenInDesktopOpen);
  const project = useProjectStore((s) => s.project);
  const id = project ? projectIdIn(project.path) : null;
  return (
    <Dialog open={open && id !== null} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Open in the desktop app")}</DialogTitle>
          <DialogDescription>
            {t(
              "The desktop app keeps this project in a folder on your computer, in sync with what you write here. There you can also compile with your own TeX distribution, work offline and use Git.",
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {rich(
            "Nothing happens? Install Polemic and sign in with this account, then choose <0>Open from your account…</0> on its start screen.",
            [(c) => <span className="font-medium text-foreground">{c}</span>],
          )}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => void openUrl(DOWNLOAD_URL)}>
            {t("Download Polemic")}
          </Button>
          <Button
            onClick={() => {
              // A link the browser hands to the app: the page stays.
              if (id) window.location.assign(desktopProjectUrl(id));
            }}
          >
            <MonitorDown />
            {t("Open the desktop app")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
