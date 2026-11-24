import { errorText } from "@/lib/error-text";
import { exportPdf } from "@/lib/tauri";
import { isWeb } from "@/lib/target";
import { useProjectStore } from "@/store/project";
import { usePreviewStore } from "@/store/preview";
import { t } from "@scholarkit/i18n";

/** Ask where to save the built PDF and copy it there. In the browser,
 *  download the PDF the preview shows. */
export async function exportPdfAs(): Promise<void> {
  const { project, mainFile } = useProjectStore.getState();
  if (!project || !mainFile) return;
  if (isWeb) {
    downloadPreviewPdf(`${project.name}.pdf`);
    return;
  }
  try {
    await exportPdf(project.path, mainFile, `${project.name}.pdf`);
  } catch (e) {
    usePreviewStore.getState().setNotice(errorText(e));
  }
}

function downloadPreviewPdf(name: string) {
  const bytes = usePreviewStore.getState().pdfBytes;
  if (!bytes) {
    usePreviewStore.getState().setNotice(t("Compile the project first."));
    return;
  }
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Give the download a moment to start before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
