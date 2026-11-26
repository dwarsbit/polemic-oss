import { useState } from "react";
import { MATH_SYMBOL_CATEGORIES } from "@/lib/math-symbols";
import { insertAtCursor } from "@/lib/editor-insert";
import { SectionHeader } from "@/components/SectionHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { t } from "@scholarkit/i18n";

export function SymbolsPanel({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [categoryId, setCategoryId] = useState(MATH_SYMBOL_CATEGORIES[0].id);
  const category =
    MATH_SYMBOL_CATEGORIES.find((c) => c.id === categoryId) ??
    MATH_SYMBOL_CATEGORIES[0];

  return (
    <div className="flex h-full flex-col">
      <SectionHeader label={t("Symbols")} collapsed={collapsed} onToggle={onToggle} />
      {collapsed === false && (
        <>
          <div className="px-3 py-2">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger
                className="h-7 w-full px-2 text-xs"
                aria-label={t("Symbols")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATH_SYMBOL_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id} className="text-xs">
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            <div className="grid grid-cols-6 gap-1">
              {category.symbols.map((symbol) => (
                <button
                  key={symbol.insert}
                  type="button"
                  title={symbol.label ?? symbol.insert}
                  className="flex h-8 items-center justify-center rounded border border-transparent text-base hover:border-border hover:bg-accent"
                  onClick={() =>
                    insertAtCursor(symbol.insert, symbol.cursorOffset, { asMath: true })
                  }
                >
                  {symbol.glyph}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
