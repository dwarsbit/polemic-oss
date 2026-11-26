import { t } from "@scholarkit/i18n";
import { colorFor, initials, type Person } from "./people";

/** How many faces show before "+N". */
const SHOWN = 4;

/** "Anna de Vries, in main.tex", or the name alone when they are on no file or page. */
export function placeOf(
  person: Person,
  nameOf: (where: string) => string = (where) => where,
): string {
  return person.where
    ? t("{name}, in {place}", { name: person.name, place: nameOf(person.where) })
    : person.name;
}

/** Someone's initials in their own color. */
export function Face({
  person,
  size = 28,
}: {
  person: Pick<Person, "id" | "name">;
  size?: number;
}) {
  return (
    <span
      className="collab-face"
      style={{ background: colorFor(person.id), width: size, height: size }}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
}

/**
 * The others in the shared project, one face each, in the header next
 * to Share. Hovering a face names the person and where they are;
 * clicking it opens their file or page (`onOpen`), unless you are there.
 */
export function Faces({
  people,
  onOpen,
  here = null,
  nameOf,
}: {
  people: Person[];
  onOpen?: (person: Person) => void;
  /** The file or page this window is on, so its people's faces don't offer to open it. */
  here?: string | null;
  /** How a file or page is named to the reader, when not by its path. */
  nameOf?: (where: string) => string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, SHOWN);
  const rest = people.slice(SHOWN);
  return (
    <div className="collab-faces" role="group" aria-label={t("Also in this project")}>
      {shown.map((person) => {
        const label = placeOf(person, nameOf);
        const canOpen =
          onOpen !== undefined && person.where !== null && person.where !== here;
        return (
          <button
            key={person.id}
            type="button"
            className="collab-face-button"
            title={label}
            aria-label={label}
            disabled={!canOpen}
            onClick={() => canOpen && onOpen(person)}
          >
            <Face person={person} />
          </button>
        );
      })}
      {rest.length > 0 && (
        <span
          className="collab-face collab-face-more"
          title={rest.map((person) => placeOf(person, nameOf)).join("\n")}
        >
          +{rest.length}
        </span>
      )}
    </div>
  );
}
