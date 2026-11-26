import { t, tn } from "@scholarkit/i18n";
import { firstName } from "./people";

/** How the open project's live connection stands. */
export type LiveConnection = "connected" | "connecting";

/** "Live with Anna", "Live with Anna and Tom", "Live with Anna, Tom and 2 others". */
export function liveWith(names: string[]): string | null {
  const first = names.map(firstName);
  if (first.length === 0) return null;
  if (first.length === 1) return t("Live with {name}", { name: first[0]! });
  if (first.length === 2)
    return t("Live with {first} and {second}", { first: first[0]!, second: first[1]! });
  const more = first.length - 2;
  return tn(
    more,
    "Live with {first}, {second} and {count} other",
    "Live with {first}, {second} and {count} others",
    { first: first[0]!, second: first[1]!, count: String(more) },
  );
}

/**
 * The status line's text for a shared project, or null when there is
 * nothing to say beyond the app's own "Saved": nobody else is in, and
 * the connection is up.
 */
export function liveStatus({
  names,
  connection,
  readOnly = false,
}: {
  /** The others in the project, one name per person. */
  names: string[];
  connection: LiveConnection;
  readOnly?: boolean;
}): { text: string; tone: "live" | "warn" | "muted" } | null {
  if (connection === "connecting")
    return {
      text: readOnly ? t("Reconnecting…") : t("Reconnecting… Your changes are kept."),
      tone: "warn",
    };
  const live = liveWith(names);
  if (live === null) return null;
  if (readOnly) return { text: t("Read only · {live}", { live }), tone: "muted" };
  return { text: live, tone: "live" };
}
