import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { EventAutocomplete } from "@/components/bets/EventAutocomplete";
import { SelectionAutocomplete } from "@/components/bets/SelectionAutocomplete";
import { MarketAutocomplete } from "@/components/bets/MarketAutocomplete";
import { toISODateInput } from "@/lib/format";
import type { LegStatus } from "@/lib/calc";

export type EditableLeg = {
  /** Chave estável só para a lista no client — não é persistida. */
  key: string;
  sport: string;
  league: string;
  event_name: string;
  home_team?: string;
  away_team?: string;
  event_date: string; // input datetime-local
  market: string;
  selection: string;
  odds: number;
  status: LegStatus;
  tipster: string;
};

const SPORTS = ["Futebol", "Basquete", "Tênis", "MMA", "eSports", "NFL", "Vôlei", "Outro"];
const LEG_STATUS: { v: LegStatus; l: string }[] = [
  { v: "pendente", l: "Pendente" },
  { v: "green", l: "Ganha" },
  { v: "red", l: "Perdida" },
  { v: "void", l: "Anulada" },
];

export function makeEmptyLeg(): EditableLeg {
  return {
    key: crypto.randomUUID(),
    sport: "Futebol",
    league: "",
    event_name: "",
    event_date: "",
    market: "",
    selection: "",
    odds: 0,
    status: "pendente",
    tipster: "",
  };
}

/** Converte uma aposta simples já registrada em uma perna editável, para reaproveitá-la em uma múltipla. */
export function legFromBet(bet: {
  sport: string | null;
  league: string | null;
  event_name: string | null;
  market: string | null;
  selection: string | null;
  odds: number;
  status: string;
  tipster: string | null;
  event_date?: string | null;
}): EditableLeg {
  const legStatusMap: Record<string, LegStatus> = {
    green: "green",
    red: "red",
    void: "void",
    pendente: "pendente",
    half_green: "green",
    half_red: "red",
    cashout: "green",
  };
  return {
    key: crypto.randomUUID(),
    sport: bet.sport ?? "Futebol",
    league: bet.league ?? "",
    event_name: bet.event_name ?? "",
    event_date: bet.event_date ? toISODateInput(bet.event_date) : "",
    market: bet.market ?? "",
    selection: bet.selection ?? "",
    odds: Number(bet.odds),
    status: legStatusMap[bet.status] ?? "pendente",
    tipster: bet.tipster ?? "",
  };
}

export function LegsEditor({
  legs,
  onChange,
}: {
  legs: EditableLeg[];
  onChange: (legs: EditableLeg[]) => void;
}) {
  function update(idx: number, patch: Partial<EditableLeg>) {
    const next = legs.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function addLeg() {
    onChange([...legs, makeEmptyLeg()]);
  }
  function removeLeg(idx: number) {
    onChange(legs.filter((_, i) => i !== idx));
  }
  function moveLeg(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= legs.length) return;
    const next = legs.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {legs.length === 0 && (
        <div className="text-xs text-muted-foreground border border-dashed rounded-md p-4 text-center">
          Nenhuma perna adicionada ainda.
        </div>
      )}
      {legs.map((leg, idx) => (
        <div key={leg.key} className="surface p-3 space-y-2 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <GripVertical className="h-3.5 w-3.5" />
              <span className="font-medium">Perna {idx + 1}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => moveLeg(idx, -1)}>
                ↑
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={idx === legs.length - 1} onClick={() => moveLeg(idx, 1)}>
                ↓
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLeg(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-2">
            <LegField label="Esporte">
              <Select value={leg.sport} onValueChange={(v) => update(idx, { sport: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </LegField>
            <LegField label="Liga">
              <Input value={leg.league} onChange={(e) => update(idx, { league: e.target.value })} />
            </LegField>
            <LegField label="Tipster">
              <Input value={leg.tipster} onChange={(e) => update(idx, { tipster: e.target.value })} />
            </LegField>

            <LegField label="Evento" className="md:col-span-2">
              <EventAutocomplete
                value={leg.event_name}
                onChange={(v) => update(idx, { event_name: v })}
                onPick={(p) => {
                  update(idx, {
                    event_name: p.name,
                    sport: p.sport || leg.sport,
                    league: p.league || leg.league,
                    event_date: p.isoDate ? toISODateInput(p.isoDate) : leg.event_date,
                    home_team: p.homeTeam,
                    away_team: p.awayTeam,
                  });
                }}
              />
            </LegField>
            <LegField label="Data do evento">
              <Input type="datetime-local" value={leg.event_date} onChange={(e) => update(idx, { event_date: e.target.value })} />
            </LegField>

            <LegField label="Mercado">
              <MarketAutocomplete
                value={leg.market}
                onChange={(v) => update(idx, { market: v, selection: "" })}
                sport={leg.sport}
              />
            </LegField>
            <LegField label="Seleção" className="md:col-span-2">
              <SelectionAutocomplete
                value={leg.selection}
                onChange={(v) => update(idx, { selection: v })}
                market={leg.market}
                homeTeam={leg.home_team}
                awayTeam={leg.away_team}
              />
            </LegField>

            <LegField label="Odd">
              <Input
                type="number"
                step="0.001"
                min={1.01}
                value={leg.odds || ""}
                onChange={(e) => update(idx, { odds: parseFloat(e.target.value) || 0 })}
              />
            </LegField>
            <LegField label="Status">
              <Select value={leg.status} onValueChange={(v) => update(idx, { status: v as LegStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEG_STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </LegField>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addLeg}>
        <Plus className="h-4 w-4 mr-2" />
        Adicionar perna
      </Button>
    </div>
  );
}

function LegField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-[11px] text-muted-foreground mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
