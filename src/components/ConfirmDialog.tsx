import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirmStore } from "@/store/confirm";
import { t } from "@scholarkit/i18n";

/** The browser build's confirm dialog: what the desktop app shows as a
 *  native dialog through `ask` (see src/web/dialog.ts). */
export function ConfirmDialog() {
  const current = useConfirmStore((s) => s.current);
  const answer = useConfirmStore((s) => s.answer);

  return (
    <Dialog open={current !== null} onOpenChange={(open) => !open && answer(false)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{current?.title ?? t("Polemic")}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {current?.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>
            {current?.cancelLabel ?? t("Cancel")}
          </Button>
          <Button autoFocus onClick={() => answer(true)}>
            {current?.okLabel ?? "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
