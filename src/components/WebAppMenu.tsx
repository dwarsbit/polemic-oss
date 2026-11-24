import { errorText } from "@/lib/error-text";
import {
  Command,
  Download,
  FileArchive,
  Info,
  Keyboard,
  LayoutList,
  LifeBuoy,
  Menu,
  MessageSquareWarning,
  MonitorDown,
  Settings,
  Share2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HELP_URL, ISSUES_URL } from "@/lib/links";
import { exportPdfAs } from "@/lib/pdf-export";
import { formatShortcut } from "@/lib/platform";
import { useDialogsStore } from "@/store/dialogs";
import { usePreviewStore } from "@/store/preview";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { t } from "@scholarkit/i18n";

/** Saves the open project as a zip, with every file. */
async function downloadProject() {
  try {
    const { projectZip } = await import("@/web/projects");
    const { name, bytes } = await projectZip();
    const url = URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    usePreviewStore.getState().setNotice(errorText(e));
  }
}

/** The browser build's app menu: what the desktop app keeps in its
 *  native menu bar under Polemic and Help. */
export function WebAppMenu() {
  const dialogs = () => useDialogsStore.getState();
  const projectOpen = useProjectStore((s) => s.project !== null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" title={t("Menu")} aria-label={t("Menu")}>
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* The Scholarkit home page: every app's projects in one list. */}
        <DropdownMenuItem onSelect={() => window.location.assign("/")}>
          <LayoutList />
          {t("Scholarkit home")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => dialogs().setPaletteOpen(true)}>
          <Command />
          {t("Command palette")}
          <DropdownMenuShortcut>{formatShortcut("Mod+P")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useSettingsStore.getState().setSettingsDialogOpen(true)}
        >
          <Settings />
          {t("Settings…")}
        </DropdownMenuItem>
        {projectOpen && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => dialogs().setShareOpen(true)}>
              <Share2 />
              {t("Share…")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dialogs().setOpenInDesktopOpen(true)}>
              <MonitorDown />
              {t("Open in the desktop app…")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportPdfAs()}>
              <Download />
              {t("Download PDF")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void downloadProject()}>
              <FileArchive />
              {t("Download project")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void openUrl(HELP_URL)}>
          <LifeBuoy />
          {t("Polemic help")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => dialogs().setShortcutsOpen(true)}>
          <Keyboard />
          {t("Keyboard shortcuts")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void openUrl(ISSUES_URL)}>
          <MessageSquareWarning />
          {t("Report an issue…")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => dialogs().setAboutOpen(true)}>
          <Info />
          {t("About Polemic")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
