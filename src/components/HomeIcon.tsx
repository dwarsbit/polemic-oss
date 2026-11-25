import { PolemicMark } from "@/components/PolemicLogo";
import { isWeb } from "@/lib/target";
import { cn } from "cn";
import { t } from "@scholarkit/i18n";

const BOX =
  "grid size-7 flex-none place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * Polemic's icon at the start of the header, the way back to the projects
 * overview, as in Cursive and Binder. In the browser it opens the Scholarkit
 * home page, which lists every app's projects. On the desktop it closes the
 * open project to the projects view; with none open it is only the icon.
 */
export function HomeIcon({ onClose }: { onClose?: () => void }) {
  const icon = <PolemicMark className="size-[22px]" />;
  if (isWeb) {
    return (
      <a
        href="/"
        title={t("Scholarkit home")}
        aria-label={t("Scholarkit home")}
        className={cn(BOX, "hover:bg-accent")}
      >
        {icon}
      </a>
    );
  }
  if (!onClose) return <span className={BOX}>{icon}</span>;
  return (
    <button
      type="button"
      title={t("All projects")}
      aria-label={t("All projects")}
      onClick={onClose}
      className={cn(BOX, "hover:bg-accent")}
    >
      {icon}
    </button>
  );
}
