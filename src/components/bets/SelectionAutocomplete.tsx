import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { getSelectionSuggestions } from "@/lib/marketSuggestions";

export function SelectionAutocomplete({
  value,
  onChange,
  market,
  homeTeam,
  awayTeam,
  placeholder,
  sport,
}: {
  value: string;
  onChange: (v: string) => void;
  market: string;
  homeTeam?: string;
  awayTeam?: string;
  placeholder?: string;
  sport?: string;
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);
  // quando o mercado muda, recalculamos sugestões; se o input estiver focado,
  // reabre o popover para o usuário escolher de novo sem precisar clicar fora.
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      setOpen(true);
    }
  }, [market]);

  const suggestions = useMemo(
    () => getSelectionSuggestions(market, homeTeam, awayTeam, sport),
    [market, homeTeam, awayTeam, sport],
  );

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((s) => s.label.toLowerCase().includes(q));
  }, [suggestions, value]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const s of filtered) {
      const g = s.group ?? "Outros";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder ?? "Ex: Vitória Brasil"}
          autoComplete="off"
        />
      </PopoverAnchor>
      {filtered.length > 0 && (
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width] max-h-80 overflow-auto"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => setOpen(false)}
        >
          <ul className="py-1">
            {grouped.map(([group, items]) => (
              <li key={group}>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                {items.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (blurTimer.current) window.clearTimeout(blurTimer.current);
                      onChange(s.label);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 focus:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    {s.label}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </PopoverContent>
      )}
    </Popover>
  );
}