import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useProfile } from "@/hooks/useProfile";
import { useBets } from "@/hooks/useBets";

/**
 * Autocomplete de Tipster. Sugere a união dos tipsters cadastrados nas
 * Configurações (profile.tipsters) com os já usados em apostas anteriores.
 */
export function TipsterAutocomplete({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { data: profile } = useProfile();
  const { data: bets = [] } = useBets();
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const options = useMemo(() => {
    const set = new Set<string>();
    for (const t of profile?.tipsters ?? []) if (t?.trim()) set.add(t.trim());
    for (const b of bets) if (b.tipster?.trim()) set.add(b.tipster.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [profile?.tipsters, bets]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((t) => t.toLowerCase().includes(q));
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
          placeholder={placeholder ?? "Ex: nome do tipster"}
          autoComplete="off"
        />
      </PopoverAnchor>
      {filtered.length > 0 && (
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width] max-h-72 overflow-auto"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={() => setOpen(false)}
        >
          <ul className="py-1">
            {filtered.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) window.clearTimeout(blurTimer.current);
                    onChange(t);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 focus:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      )}
    </Popover>
  );
}
