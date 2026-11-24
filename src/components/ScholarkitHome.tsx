import { t } from "@scholarkit/i18n";

/**
 * The Scholarkit icon as the way to the Scholarkit home page, which lists every app's projects.
 * Only for the browser: the desktop apps have no such page. The same drawing as the brand's
 * scholarkit-icon.svg: Polemic's square, Binder's circle, Cursive's quarter-circle and
 * Scholarkit's arch on a light tile.
 */
export function ScholarkitHome({ className }: { className?: string }) {
  return (
    <a
      href="/"
      title={t("Scholarkit home")}
      aria-label={t("Scholarkit home")}
      className={`grid size-7 flex-none place-items-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 ${className ?? ""}`}
    >
      <svg viewBox="0 0 256 256" aria-hidden className="size-5">
        <rect
          x="4"
          y="4"
          width="248"
          height="248"
          rx="56"
          fill="#FAFAFA"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="8"
        />
        <rect x="59" y="59" width="62" height="62" rx="7" fill="#623E64" />
        <circle cx="166" cy="90" r="31" fill="#0F5B62" />
        <path
          d="M66 135h48a7 7 0 0 1 7 7v47.5a7 7 0 0 1-8 7A62 62 0 0 1 59.5 143a7 7 0 0 1 6.5-8z"
          fill="#9A4A1C"
        />
        <path
          d="M135 166a31 31 0 0 1 62 0v24a7 7 0 0 1-7 7h-48a7 7 0 0 1-7-7z"
          fill="#B5841C"
        />
      </svg>
    </a>
  );
}
