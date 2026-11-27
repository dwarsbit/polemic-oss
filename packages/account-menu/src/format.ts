import type { Translator } from "@scholarkit/i18n";

/** What the menu needs of a translator: the apps pass none and get the active one. */
export type MenuTranslator = Pick<Translator, "t" | "tn" | "formatNumber">;

/** GET /api/usage: what the signed-in account uses of its plan. */
export interface AccountUsage {
  /** The plan; a server from before plans in the usage answer leaves it out. */
  plan?: string;
  storage: { usedBytes: number; limitBytes: number };
  /** The share of today's compile time used, 0 to 100. */
  compile: { usedPercent: number; resetsAt?: string };
  /** limit is null: unlimited. */
  reviewLinks: { count: number; limit: number | null };
  /** The share of this month's assistant on Scholarkit's model used; null or left out on Free. */
  assistant?: { usedPercent: number; resetsAt?: string } | null;
}

/** The plan to upgrade to from this one; null on Pro, on a plan this version doesn't know, and without one. */
export function upgradeFrom(plan: string | null | undefined): "plus" | "pro" | null {
  if (plan === "free") return "plus";
  if (plan === "plus") return "pro";
  return null;
}

/**
 * The plan's name as the account page shows it. "student" and "professional" come from servers
 * before the current plans; a plan this version doesn't know shows as the server names it.
 */
export function planName(plan: string, { t }: Pick<MenuTranslator, "t">): string {
  switch (plan) {
    case "free":
      return t("Free");
    case "plus":
      return t("Plus");
    case "pro":
    case "professional":
      return t("Pro");
    case "student":
      return t("Student");
    default:
      return plan.charAt(0).toUpperCase() + plan.slice(1);
  }
}

/** Bytes as people read them, in decimal units as the plans give them: "42.5 KB", "5 GB". */
export function formatBytes(
  bytes: number,
  { formatNumber }: Pick<MenuTranslator, "formatNumber">,
): string {
  const units: [number, string][] = [
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "KB"],
  ];
  for (const [size, unit] of units) {
    if (bytes >= size)
      return `${formatNumber(bytes / size, { maximumFractionDigits: 1 })} ${unit}`;
  }
  return `${formatNumber(bytes)} B`;
}

/** First and last name as two letters: "Anna de Vries" is AV. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => [...word][0] ?? "")
    .filter((letter) => /\p{L}|\p{N}/u.test(letter));
  const picked =
    letters.length > 2 ? [letters[0], letters[letters.length - 1]] : letters;
  return picked.join("").toUpperCase();
}
