import { t } from "@scholarkit/i18n";
/** Comment categories with their gutter/panel colors. */

export interface CommentCategory {
  id: string;
  label: string;
  /** Gutter bar color (Tailwind oklch values, see index.css). */
  color: string;
}

export const COMMENT_CATEGORIES: CommentCategory[] = [
  {
    id: "change",
    label: t("Change needed"),
    color: "oklch(70.5% 0.213 47.604)", // orange-500
  },
  {
    id: "source",
    label: t("Source needed"),
    color: "oklch(68.5% 0.169 237.323)", // sky-500
  },
  {
    id: "question",
    label: t("Question"),
    color: "oklch(60.6% 0.25 292.717)", // violet-500
  },
  {
    id: "wording",
    label: t("Wording"),
    color: "oklch(64.5% 0.246 16.439)", // rose-500
  },
  {
    id: "verify",
    label: t("Verify"),
    color: "oklch(69.6% 0.17 162.48)", // emerald-500
  },
  {
    id: "note",
    label: t("Note"),
    color: "oklch(55.4% 0.046 257.417)", // slate-500
  },
];

export function commentCategory(id: string): CommentCategory {
  return (
    COMMENT_CATEGORIES.find((category) => category.id === id) ??
    COMMENT_CATEGORIES[COMMENT_CATEGORIES.length - 1]
  );
}
