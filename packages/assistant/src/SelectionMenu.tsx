import { t } from "@scholarkit/i18n";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AssistantMark, Icon } from "./icons";

export interface MenuItem {
  id: string;
  label: string;
  /** A name from `icons.tsx`, or the app's own icon. */
  icon?: string | ReactNode;
  /** Said after the label, such as "Searches 250 million works". */
  hint?: string;
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export interface SelectionMenuProps {
  groups: MenuGroup[];
  /** Such as "Ask about the selection…". */
  placeholder: string;
  onPick: (id: string) => void;
  /** The person typed their own question instead. */
  onAsk: (text: string) => void;
  onClose: () => void;
}

/**
 * The Ask menu on a selection: a question of one's own, or one of the app's
 * ready actions. Typing filters the actions; Enter runs the one picked, or
 * asks the typed question when none matches.
 */
export function SelectionMenu({
  groups,
  placeholder,
  onPick,
  onAsk,
  onClose,
}: SelectionMenuProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => !q || i.label.toLocaleLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);
  const flat = shown.flatMap((g) => g.items);
  const current = Math.min(active, Math.max(0, flat.length - 1));

  return (
    <div
      className="assistant-menu"
      role="dialog"
      aria-label={t("Ask the assistant")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (flat.length)
            setActive(
              (current + (e.key === "ArrowDown" ? 1 : flat.length - 1)) % flat.length,
            );
        } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (flat[current]) onPick(flat[current].id);
          else if (query.trim()) onAsk(query.trim());
        }
      }}
    >
      <div className="assistant-menu-input">
        <AssistantMark size="sm" />
        <input
          ref={input}
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded
          aria-controls="assistant-menu-list"
          aria-activedescendant={
            flat[current] ? `assistant-menu-${flat[current].id}` : undefined
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
      </div>
      <div className="assistant-menu-list" id="assistant-menu-list" role="listbox">
        {shown.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <div className="assistant-menu-label">{group.label}</div>
            {group.items.map((item) => {
              const on = flat[current]?.id === item.id;
              return (
                <div
                  key={item.id}
                  id={`assistant-menu-${item.id}`}
                  role="option"
                  aria-selected={on}
                  className="assistant-menu-item"
                  onMouseEnter={() => setActive(flat.indexOf(item))}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(item.id)}
                >
                  {typeof item.icon === "string" ? (
                    <Icon name={item.icon} size={14} />
                  ) : (
                    item.icon
                  )}
                  <span className="assistant-grow">
                    {item.label}
                    {item.hint && (
                      <span className="assistant-menu-hint">{item.hint}</span>
                    )}
                  </span>
                  {on && <Icon name="corner-down-left" size={12} />}
                </div>
              );
            })}
          </div>
        ))}
        {flat.length === 0 && query.trim() && (
          <div
            className="assistant-menu-item"
            role="option"
            aria-selected
            onClick={() => onAsk(query.trim())}
          >
            <Icon name="arrow-up" size={14} />
            <span className="assistant-grow">
              {t("Ask “{question}”", { question: query.trim() })}
            </span>
            <Icon name="corner-down-left" size={12} />
          </div>
        )}
      </div>
    </div>
  );
}
