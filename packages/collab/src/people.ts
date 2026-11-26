/**
 * How people show up in a shared project: a color of their own, which
 * their face, their caret and their selection use, and their initials.
 * The same person has the same color in Polemic and Cursive, in every
 * window.
 */

/** Deep enough for white initials on top, apart from each other and from the apps' own colors. */
export const COLORS = [
  "#c2255c",
  "#1971c2",
  "#087f5b",
  "#d9480f",
  "#6741d9",
  "#0c8599",
  "#9c36b5",
  "#5c940d",
] as const;

/** The same color for the same account, in every window and app. */
export function colorFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length]!;
}

/** "AB" for Anna Berg, "A" for Anna. Titles such as "Prof." don't count. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !word.endsWith("."));
  if (words.length === 0) return "?";
  const first = [...words[0]!][0]!;
  const last = words.length > 1 ? [...words[words.length - 1]!][0]! : "";
  return (first + last).toUpperCase();
}

/** "Anna" for Anna de Vries; titles such as "Dr." are skipped. */
export function firstName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !word.endsWith("."));
  return words[0] ?? name.trim();
}

/** Someone else in the project, once however many windows they have open. */
export interface Person {
  /** Their account. */
  id: string;
  name: string;
  /** The file or page they are on, as the app names it; null when none. */
  where: string | null;
}

/**
 * One entry per account, in name order, leaving out `self`. Of someone's
 * windows, the first one that is on a file or page says where they are.
 */
export function onePerPerson(
  windows: Iterable<{ id: string; name: string; where: string | null }>,
  self: string | null,
): Person[] {
  const people = new Map<string, Person>();
  for (const window of windows) {
    if (window.id === self) continue;
    const known = people.get(window.id);
    if (!known) people.set(window.id, { ...window });
    else if (known.where === null && window.where !== null) known.where = window.where;
  }
  return [...people.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
