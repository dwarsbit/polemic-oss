import { errorText } from "@/lib/error-text";
import { useState } from "react";
import { Camera, FileDiff, RotateCcw } from "lucide-react";
import { SectionHeader } from "@/components/SectionHeader";
import { SnapshotDiffDialog } from "@/components/SnapshotDiffDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SnapshotInfo } from "@/lib/tauri";
import { useProjectStore } from "@/store/project";
import { t } from "@scholarkit/i18n";

export function SnapshotsPanel() {
  const snapshots = useProjectStore((s) => s.snapshots);
  const [restoreTarget, setRestoreTarget] = useState<SnapshotInfo | null>(null);
  const [diffTarget, setDiffTarget] = useState<SnapshotInfo | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function confirmRestore() {
    if (!restoreTarget) return;
    setDialogError(null);
    try {
      await useProjectStore.getState().restoreSnapshot(restoreTarget.id);
      setRestoreTarget(null);
    } catch (e) {
      setDialogError(errorText(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        label={t("Snapshots")}

        actions={
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            title={t("Take a snapshot of the current project state")}
            onClick={() => void useProjectStore.getState().takeSnapshot()}
          >
            <Camera className="size-3.5" />
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-1.5">
        {snapshots.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">{t("No snapshots yet.")}</p>
        ) : (
          <ul>
            {snapshots.map((snap) => (
              <li
                key={snap.id}
                className="flex items-center justify-between rounded px-2 py-1"
              >
                <span className="truncate text-xs">
                  {new Date(snap.createdAtMillis).toLocaleString()}
                </span>
                <span className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    title={t("View changes against the current project")}
                    onClick={() => setDiffTarget(snap)}
                  >
                    <FileDiff className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    title={t("Restore this snapshot")}
                    onClick={() => setRestoreTarget(snap)}
                  >
                    <RotateCcw className="size-3" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Restore snapshot")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {t(
              "Restore the project to the snapshot from {date}? A safety snapshot of the current state is created first.",
              {
                date: restoreTarget
                  ? new Date(restoreTarget.createdAtMillis).toLocaleString()
                  : "",
              },
            )}
          </p>
          {dialogError && <p className="text-xs text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void confirmRestore()}>
              {t("Restore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {diffTarget && (
        <SnapshotDiffDialog snapshot={diffTarget} onClose={() => setDiffTarget(null)} />
      )}
    </div>
  );
}
