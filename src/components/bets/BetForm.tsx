import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  computeNetProfit,
  computeGrossReturn,
  edgeValue,
  expectedValue,
  impliedProbability,
  kellyDecimal,
  kellyStake,
  clvPercent,
  STATUS_LABELS,
  type BetStatus,
} from "@/lib/calc";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency, formatPercent, toISODateInput } from "@/lib/format";
import type { Bet, BetInput } from "@/hooks/useBets";
import { toast } from "sonner";
import { BookmakerSelect } from "@/components/bookmakers/BookmakerSelect";
import { EventAutocomplete } from "@/components/bets/EventAutocomplete";
import { SelectionAutocomplete } from "@/components/bets/SelectionAutocomplete";
import { COMMON_MARKETS } from "@/lib/marketSuggestions";

const SPORTS = ["Futebol", "Basquete", "Tênis", "MMA", "eSports", "NFL", "Vôlei", "Outro"];
const BET_TYPES = [
  { v: "simples", l: "Simples" },
  { v: "multipla", l: "Múltipla" },
  { v: "sistema", l: "Sistema" },
];
const TIMING = [
  { v: "pre-live", l: "Pré-live" },
  { v: "live", l: "Live" },
];

export function BetForm({
  initial,
  bankrollNow,
  onSubmit,
  submitLabel = "Salvar aposta",
}: {
  initial?: Partial<Bet>;
  bankrollNow: number;
  onSubmit: (data: BetInput) => Promise<void> | void;
  submitLabel?: string;
}) {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "BRL";

  const [betDate, setBetDate] = useState(toISODateInput(initial?.bet_date ?? new Date()));
  const [eventDate, setEventDate] = useState(toISODateInput(initial?.event_date ?? ""));
  const [sport, setSport] = useState(initial?.sport ?? "Futebol");
  const [league, setLeague] = useState(initial?.league ?? "");
  const [event_name, setEventName] = useState(initial?.event_name ?? "");
  const [homeTeam, setHomeTeam] = useState<string | undefined>(undefined);
  const [awayTeam, setAwayTeam] = useState<string | undefined>(undefined);
  function applyEventPick(p: { name: string; isoDate: string | null; sport: string; league: string; homeTeam?: string; awayTeam?: string }) {
    setEventName(p.name);
    if (p.sport) setSport(p.sport);
    if (p.league) setLeague(p.league);
    if (p.isoDate) setEventDate(toISODateInput(p.isoDate));
    setHomeTeam(p.homeTeam);
    setAwayTeam(p.awayTeam);
  }
  const [market, setMarket] = useState(initial?.market ?? "");
  const [selection, setSelection] = useState(initial?.selection ?? "");
  const [bookmaker, setBookmaker] = useState(initial?.bookmaker ?? "");
  const [bet_type, setBetType] = useState(initial?.bet_type ?? "simples");
  const [timing, setTiming] = useState(initial?.timing ?? "pre-live");
  const [odds, setOdds] = useState<number>(Number(initial?.odds ?? 0));
  const [closing_odds, setClosingOdds] = useState<number | undefined>(
    initial?.closing_odds ? Number(initial.closing_odds) : undefined,
  );
  const [stake_amount, setStake] = useState<number>(Number(initial?.stake_amount ?? 0));
  const [status, setStatus] = useState<BetStatus>((initial?.status as BetStatus) ?? "pendente");
  const [estimated_probability, setEstProb] = useState<number | undefined>(
    initial?.estimated_probability ?? undefined,
  );
  const [cashoutReturn, setCashoutReturn] = useState<number | undefined>(
    initial?.gross_return && initial.status === "cashout" ? Number(initial.gross_return) : undefined,
  );
  const [tags, setTags] = useState<string>(initial?.tags?.join(", ") ?? "");
  const [tipster, setTipster] = useState(initial?.tipster ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [external_link, setExternalLink] = useState(initial?.external_link ?? "");

  const calc = useMemo(() => {
    const implied = impliedProbability(odds);
    const edge = estimated_probability != null ? edgeValue(estimated_probability, odds) : null;
    const ev = estimated_probability != null ? expectedValue(estimated_probability, odds, stake_amount) : null;
    const kellyDec = estimated_probability != null ? kellyDecimal(estimated_probability, odds) : null;
    const recommended = estimated_probability != null
      ? kellyStake(estimated_probability, odds, bankrollNow, profile?.kelly_fraction ?? 0.25)
      : null;
    const clv = clvPercent(odds, closing_odds);
    const potentialReturn = stake_amount * odds;
    const net = computeNetProfit(status, stake_amount, odds, cashoutReturn);
    const gross = computeGrossReturn(status, stake_amount, odds, cashoutReturn);
    const stakeOverBankrollPct = bankrollNow > 0 ? (stake_amount / bankrollNow) * 100 : 0;
    return { implied, edge, ev, kellyDec, recommended, clv, potentialReturn, net, gross, stakeOverBankrollPct };
  }, [odds, closing_odds, stake_amount, estimated_probability, status, cashoutReturn, bankrollNow, profile?.kelly_fraction]);

  useEffect(() => {
    if (profile?.unit_value && stake_amount === 0 && !initial) {
      setStake(profile.unit_value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.unit_value]);

  function validate(): string | null {
    if (!odds || odds <= 1) return "A odd deve ser maior que 1.00";
    if (!stake_amount || stake_amount <= 0) return "A stake deve ser positiva";
    if (closing_odds != null && closing_odds <= 1) return "Closing odd deve ser maior que 1.00";
    if (estimated_probability != null && (estimated_probability < 0 || estimated_probability > 100))
      return "Probabilidade estimada deve estar entre 0% e 100%";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    if (profile && calc.stakeOverBankrollPct > Number(profile.stake_warning_percent)) {
      // just warn
      toast.warning(`Stake é ${calc.stakeOverBankrollPct.toFixed(1)}% da banca (limite ${profile.stake_warning_percent}%)`);
    }

    const data: BetInput = {
      bet_date: new Date(betDate).toISOString(),
      event_date: eventDate ? new Date(eventDate).toISOString() : null,
      sport, league, event_name, market, selection, bookmaker,
      bet_type, timing,
      odds, closing_odds: closing_odds ?? null,
      stake_amount,
      stake_units: profile?.unit_value ? stake_amount / profile.unit_value : null,
      unit_value_at_bet: profile?.unit_value ?? null,
      status,
      gross_return: calc.gross,
      net_profit: calc.net,
      estimated_probability: estimated_probability ?? null,
      implied_probability: calc.implied,
      edge: calc.edge,
      ev: calc.ev,
      kelly_fraction: calc.kellyDec,
      recommended_stake: calc.recommended,
      clv: calc.clv,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      tipster, notes, external_link,
    };
    await onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="basico">
        <TabsList>
          <TabsTrigger value="basico">Rápido</TabsTrigger>
          <TabsTrigger value="avancado">Avançado</TabsTrigger>
        </TabsList>

        <TabsContent value="basico" className="space-y-4 pt-4">
          <div className="grid md:grid-cols-3 gap-3">
            <FieldDate label="Data da aposta" value={betDate} onChange={setBetDate} />
            <Field label="Esporte">
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Casa de aposta">
              <BookmakerSelect value={bookmaker} onChange={setBookmaker} />
            </Field>
            <Field label="Evento" className="md:col-span-2">
              <EventAutocomplete
                value={event_name}
                onChange={setEventName}
                onPick={applyEventPick}
                placeholder="Ex: Uruguai (digite p/ buscar partidas)"
              />
            </Field>
            <Field label="Mercado">
              <Input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Ex: Resultado final" list="market-suggestions" />
            </Field>
            <Field label="Seleção" className="md:col-span-2">
              <SelectionAutocomplete
                value={selection}
                onChange={setSelection}
                market={market}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            </Field>
            <Field label="Odd">
              <Input type="number" step="0.01" min={1.01} value={odds || ""} onChange={(e) => setOdds(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label={`Stake (${currency})`}>
              <Input type="number" step="0.01" min={0} value={stake_amount || ""} onChange={(e) => setStake(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Unidades">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={profile?.unit_value ? (stake_amount / profile.unit_value).toFixed(2) : ""}
                onChange={(e) => {
                  const u = parseFloat(e.target.value) || 0;
                  if (profile?.unit_value) setStake(+(u * profile.unit_value).toFixed(2));
                }}
                placeholder={profile?.unit_value ? `1u = ${formatCurrency(profile.unit_value, currency)}` : "—"}
              />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={(v) => setStatus(v as BetStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="avancado" className="space-y-4 pt-4">
          <div className="grid md:grid-cols-3 gap-3">
            <FieldDate label="Data da aposta" value={betDate} onChange={setBetDate} />
            <FieldDate label="Data do evento" value={eventDate} onChange={setEventDate} />
            <Field label="Tipo de aposta">
              <Select value={bet_type} onValueChange={setBetType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BET_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Momento">
              <Select value={timing} onValueChange={setTiming}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMING.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Esporte">
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Liga / campeonato">
              <Input value={league} onChange={(e) => setLeague(e.target.value)} />
            </Field>
            <Field label="Casa de aposta">
              <BookmakerSelect value={bookmaker} onChange={setBookmaker} />
            </Field>
            <Field label="Evento" className="md:col-span-3">
              <EventAutocomplete
                value={event_name}
                onChange={setEventName}
                onPick={applyEventPick}
              />
            </Field>
            <Field label="Mercado">
              <Input value={market} onChange={(e) => setMarket(e.target.value)} list="market-suggestions" />
            </Field>
            <Field label="Seleção" className="md:col-span-2">
              <SelectionAutocomplete
                value={selection}
                onChange={setSelection}
                market={market}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
              />
            </Field>

            <Field label="Odd apostada">
              <Input type="number" step="0.01" min={1.01} value={odds || ""} onChange={(e) => setOdds(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Closing odd">
              <Input type="number" step="0.01" min={1.01} value={closing_odds ?? ""} onChange={(e) => setClosingOdds(e.target.value ? parseFloat(e.target.value) : undefined)} />
            </Field>
            <Field label={`Stake (${currency})`}>
              <Input type="number" step="0.01" min={0} value={stake_amount || ""} onChange={(e) => setStake(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Unidades">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={profile?.unit_value ? (stake_amount / profile.unit_value).toFixed(2) : ""}
                onChange={(e) => {
                  const u = parseFloat(e.target.value) || 0;
                  if (profile?.unit_value) setStake(+(u * profile.unit_value).toFixed(2));
                }}
                placeholder={profile?.unit_value ? `1u = ${formatCurrency(profile.unit_value, currency)}` : "—"}
              />
            </Field>

            <Field label="Prob. estimada (%)">
              <Input type="number" step="0.1" min={0} max={100} value={estimated_probability ?? ""} onChange={(e) => setEstProb(e.target.value ? parseFloat(e.target.value) : undefined)} />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={(v) => setStatus(v as BetStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {status === "cashout" && (
              <Field label="Retorno do cashout">
                <Input type="number" step="0.01" value={cashoutReturn ?? ""} onChange={(e) => setCashoutReturn(e.target.value ? parseFloat(e.target.value) : undefined)} />
              </Field>
            )}

            <Field label="Tipster / fonte">
              <Input value={tipster} onChange={(e) => setTipster(e.target.value)} />
            </Field>
            <Field label="Tags (separe por vírgula)" className="md:col-span-2">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="value, underdog, asian-handicap" />
            </Field>
            <Field label="Link externo" className="md:col-span-3">
              <Input value={external_link} onChange={(e) => setExternalLink(e.target.value)} />
            </Field>
            <Field label="Observações" className="md:col-span-3">
              <Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </Field>
          </div>
        </TabsContent>
      </Tabs>

      <datalist id="market-suggestions">
        {COMMON_MARKETS.map((m) => <option key={m} value={m} />)}
      </datalist>

      <div className="surface p-4 grid md:grid-cols-4 gap-3 text-sm">
        <Calc label="Prob. implícita" value={formatPercent(calc.implied)} />
        <Calc label="Retorno potencial" value={formatCurrency(calc.potentialReturn, currency)} />
        <Calc label="Lucro potencial" value={formatCurrency(stake_amount * (odds - 1), currency)} />
        <Calc label="Stake / banca" value={formatPercent(calc.stakeOverBankrollPct)} tone={calc.stakeOverBankrollPct > (profile?.stake_warning_percent ?? 5) ? "negative" : "neutral"} />
        {calc.edge != null && <Calc label="Edge" value={formatPercent(calc.edge)} tone={calc.edge > 0 ? "positive" : "negative"} />}
        {calc.ev != null && <Calc label="EV" value={formatCurrency(calc.ev, currency)} tone={calc.ev > 0 ? "positive" : "negative"} />}
        {calc.kellyDec != null && <Calc label="Kelly decimal" value={formatPercent(calc.kellyDec * 100)} tone={calc.kellyDec < 0 ? "negative" : "positive"} />}
        {calc.recommended != null && <Calc label={`Kelly stake (×${profile?.kelly_fraction ?? 0.25})`} value={formatCurrency(Math.max(0, calc.recommended), currency)} />}
        {calc.clv != null && <Calc label="CLV" value={formatPercent(calc.clv)} tone={calc.clv > 0 ? "positive" : "negative"} />}
        <Calc label="Lucro líquido (calc)" value={formatCurrency(calc.net, currency)} tone={calc.net > 0 ? "positive" : calc.net < 0 ? "negative" : "neutral"} />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      {children}
    </div>
  );
}
function FieldDate({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <Field label={label}>
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
function Calc({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`font-mono font-semibold mt-0.5 ${tone === "positive" ? "positive" : tone === "negative" ? "negative" : ""}`}>{value}</div>
    </div>
  );
}