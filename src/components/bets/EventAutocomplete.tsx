import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchEvents, mapSportLabel, type SportEvent } from "@/lib/sportsdb";
import { Loader2, CalendarDays } from "lucide-react";

type Pick = {
  name: string;
  isoDate: string | null;
  sport: string;
  league: string;
  homeTeam?: string;
  awayTeam?: string;
};

export function EventAutocomplete({
  value,
  onChange,
  onPick,
  placeholder,
  sport,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: Pick) => void;
  placeholder?: string;
  sport?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SportEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const justPickedRef = useRef(false);

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const q = value.trim();
    // Mínimo 3 chars + debounce 500ms: queries de 2 letras nunca acham nada
    // útil e cada disparo custa até 6 requests somando as duas APIs.
    if (q.length < 3) { setResults([]); setLoading(false); setOpen(false); return; }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const list = await searchEvents(q, ctrl.signal, sport);
        if (!ctrl.signal.aborted) {
          setResults(list);
          setOpen(true);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [value, sport]);

  function pick(ev: SportEvent) {
    justPickedRef.current = true;
    abortRef.current?.abort();
    onPick({
      name: ev.name,
      isoDate: ev.date,
      sport: mapSportLabel(ev.sport),
      league: ev.league,
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
    });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            placeholder={placeholder ?? "Ex: Uruguai ou Brasil x Argentina"}
            autoComplete="off"
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] max-h-80 overflow-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {results.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Nenhum evento encontrado.</div>
        ) : (
          <ul className="py-1">
            {results.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => pick(ev)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/60 focus:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{ev.name}</span>
                    {ev.date && (
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 shrink-0">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(ev.date).toLocaleString([], {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[mapSportLabel(ev.sport), ev.league].filter(Boolean).join(" • ")}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}