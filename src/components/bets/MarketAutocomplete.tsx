import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { getMarketSuggestions } from "@/lib/marketSuggestions";

export function MarketAutocomplete({
  value,
  onChange,
  sport,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  sport?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const options = useMemo(() => getMarketSuggestions(sport), [sport]);
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((m) => m.toLowerCase().includes(q));
  }, [value, options]);

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder ?? "Ex: Resultado final"}
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
            {filtered.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) window.clearTimeout(blurTimer.current);
                    onChange(m);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 focus:bg-muted/60 outline-none"
                >
                  {m}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      )}
    </Popover>
  );
}
