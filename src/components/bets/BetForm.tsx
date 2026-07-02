import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  recomputeBetDerived,
  clvPercent,
  STATUS_LABELS,
  type BetStatus,
  type BetLeg,
} from "@/lib/calc";
import { useProfile } from "@/hooks/useProfile";
import { formatCurrency, formatPercent, toISODateInput } from "@/lib/format";
import type { Bet, BetInput, BetLegRow } from "@/hooks/useBets";
import { toast } from "sonner";
import { BookmakerSelect } from "@/components/bookmakers/BookmakerSelect";
import { EventAutocomplete } from "@/components/bets/EventAutocomplete";
import { SelectionAutocomplete } from "@/components/bets/SelectionAutocomplete";
import { MarketAutocomplete } from "@/components/bets/MarketAutocomplete";
import { TipsterAutocomplete } from "@/components/bets/TipsterAutocomplete";
import { LegsEditor, type EditableLeg } from "@/components/bets/LegsEditor";

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
  initialLegs,
  prefillLegs,
  bankrollNow,
  onSubmit,
  submitLabel = "Salvar aposta",
}: {
  initial?: Partial<Bet>;
  initialLegs?: BetLegRow[];
  /** Pernas pré-preenchidas vindas de apostas simples combinadas em uma múltipla (novo registro apenas). */
  prefillLegs?: EditableLeg[];
  bankrollNow: number;
  onSubmit: (data: BetInput, opts: { keepOpen: boolean }) => Promise<void> | void;
  submitLabel?: string;
}) {
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "BRL";

  // ✨ QUICK ENTRY STATE
  const [isEventFixed, setIsEventFixed] = useState(false);

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
    if (p.isoDate) {
      const iso = toISODateInput(p.isoDate);
      setEventDate(iso);
      setBetDate(iso);
    }
    setHomeTeam(p.homeTeam);
    setAwayTeam(p.awayTeam);
  }

  const [market, setMarket] = useState(initial?.market ?? "");
  const [selection, setSelection] = useState(initial?.selection ?? "");
  function changeMarket(v: string) {
    setMarket(v);
    // Mantém a seleção já preenchida ao trocar o mercado (útil ao editar).
  }
  const [bookmaker, setBookmaker] = useState(initial?.bookmaker ?? "");
  const [bet_type, setBetType] = useState(initial?.bet_type ?? (prefillLegs && prefillLegs.length > 0 ? "multipla" : "simples"));
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
  const [is_free_bet, setIsFreeBet] = useState<boolean>(initial?.is_free_bet ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [external_link, setExternalLink] = useState(initial?.external_link ?? "");

  const [legs, setLegs] = useState<EditableLeg[]>(() => {
    if (initialLegs && initialLegs.length > 0) {
      return initialLegs.map((l) => ({
        key: l.id,
        sport: l.sport ?? "Futebol",
        league: l.league ?? "",
        event_name: l.event_name ?? "",
        home_team: l.home_team ?? undefined,
        away_team: l.away_team ?? undefined,
        event_date: toISODateInput(l.event_date ?? ""),
        market: l.market ?? "",
        selection: l.selection ?? "",
        odds: Number(l.odds),
        status: l.status,
        tipster: l.tipster ?? "",
      }));
    }
    if (prefillLegs && prefillLegs.length > 0) {
      return prefillLegs;
    }
    return [];
  });

  const isMultiple = bet_type === "multipla";

  const legsAsBetLeg: BetLeg[] = useMemo(
    () => legs.map((l) => ({ odds: l.odds, status: l.status })),
    [legs],
  );

  const calc = useMemo(() => {
    const derived = recomputeBetDerived({
      status,
      odds,
      stake_amount,
      closing_odds: closing_odds ?? null,
      estimated_probability: estimated_probability ?? null,
      gross_return: cashoutReturn ?? null,
      kelly_fraction_setting: profile?.kelly_fraction ?? 0.25,
      bankroll: bankrollNow,
      is_free_bet,
      legs: isMultiple ? legsAsBetLeg : undefined,
    });
    const effectiveOdds = derived.odds;
    const clv = clvPercent(effectiveOdds, closing_odds);
    const potentialReturn = stake_amount * effectiveOdds;
    const stakeOverBankrollPct = bankrollNow > 0 ? (stake_amount / bankrollNow) * 100 : 0;
    return {
      implied: derived.implied_probability,
      edge: derived.edge,
      ev: derived.ev,
      kellyDec: derived.kelly_fraction,
      recommended: derived.recommended_stake,
      clv,
      potentialReturn,
      net: derived.net_profit,
      gross: derived.gross_return,
      stakeOverBankrollPct,
      effectiveOdds,
      effectiveStatus: derived.status,
    };
  }, [odds, closing_odds, stake_amount, estimated_probability, status, cashoutReturn, bankrollNow, profile?.kelly_fraction, isMultiple, legsAsBetLeg, is_free_bet]);

  useEffect(() => {
    if (profile?.unit_value && stake_amount === 0 && !initial) {
      setStake(profile.unit_value);
    }
  }, [profile?.unit_value]);

  useEffect(() => {
    if (profile?.default_bookmaker && !bookmaker && !initial) {
      setBookmaker(profile.default_bookmaker);
    }
  }, [profile?.default_bookmaker]);

  function validate(): string | null {
    if (isMultiple) {
      if (legs.length < 2) return "Uma múltipla precisa de ao menos 2 pernas";
      if (legs.some((l) => !l.odds || l.odds <= 1)) return "Todas as pernas precisam de odd maior que 1.00";
    } else {
      if (!odds || odds <= 1) return "A odd deve ser maior que 1.00";
    }
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
      toast.warning(`Stake é ${calc.stakeOverBankrollPct.toFixed(1)}% da banca (limite ${profile.stake_warning_percent}%)`);
    }

    const data: BetInput = {
      bet_date: new Date(betDate).toISOString(),
      event_date: eventDate ? new Date(eventDate).toISOString() : null,
      sport, league, event_name, market, selection, bookmaker,
      bet_type, timing,
      odds: isMultiple ? calc.effectiveOdds : odds,
      closing_odds: closing_odds ?? null,
      stake_amount,
      stake_units: profile?.unit_value ? stake_amount / profile.unit_value : null,
      unit_value_at_bet: profile?.unit_value ?? null,
      status: isMultiple ? calc.effectiveStatus : status,
      is_free_bet,
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
      legs: isMultiple
        ? legs.map((l, idx) => ({
            order_index: idx,
            sport: l.sport || null,
            league: l.league || null,
            event_name: l.event_name || null,
            home_team: l.home_team || null,
            away_team: l.away_team || null,
            event_date: l.event_date ? new Date(l.event_date).toISOString() : null,
            market: l.market || null,
            selection: l.selection || null,
            odds: l.odds,
            status: l.status,
            tipster: l.tipster || null,
          }))
        : [],
    };
    const keepOpen = !initial && isEventFixed;
    await onSubmit(data, { keepOpen });

    if (!initial) {
      if (isEventFixed) {
        setMarket("");
        setSelection("");
        setOdds(0);
        setStake(0);
      } else {
        setSport("Futebol");
        setLeague("");
        setEventName("");
        setHomeTeam(undefined);
        setAwayTeam(undefined);
        setMarket("");
        setSelection("");
        setOdds(0);
        setStake(0);
      }
    }
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
            <Field label="Casa de aposta">
              <BookmakerSelect value={bookmaker} onChange={setBookmaker} />
            </Field>
            <Field label="Tipo de aposta">
              <Select value={bet_type} onValueChange={setBetType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BET_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            {!isMultiple && (
              <>
                <Field label="Esporte">
                  <Select value={sport} onValueChange={setSport}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SPORTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>

                <Field label="Evento" className="md:col-span-2">
                  <EventAutocomplete
                    value={event_name}
                    onChange={setEventName}
                    onPick={applyEventPick}
                    placeholder="Ex: Uruguai ou Brasil x Argentina"
                  />
                </Field>

                <Field label="Mercado">
                  <MarketAutocomplete value={market} onChange={changeMarket} sport={sport} placeholder="Ex: Resultado final" />
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
                  <Input type="number" step="0.001" min={1.01} value={odds || ""} onChange={(e) => setOdds(parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Tipster" className="md:col-span-2">
                  <TipsterAutocomplete value={tipster} onChange={setTipster} />
                </Field>
              </>
            )}

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
            {!isMultiple && (
              <Field label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as BetStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {!isMultiple && status === "cashout" && (
              <Field label="Retorno do cashout">
                <Input type="number" step="0.01" value={cashoutReturn ?? ""} onChange={(e) => setCashoutReturn(e.target.value ? parseFloat(e.target.value) : undefined)} />
              </Field>
            )}
            {!isMultiple && (
              <div className="flex items-center space-x-2 self-end pb-2">
                <Switch
                  checked={isEventFixed}
                  onCheckedChange={setIsEventFixed}
                  className="data-[state=checked]:bg-blue-500"
                  id="keep-event-info"
                />
                <Label
                  htmlFor="keep-event-info"
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  Manter informações do evento
                </Label>
              </div>
            )}
            {!isMultiple && (
              <div className="flex items-center space-x-2 self-end pb-2">
                <Switch
                  checked={is_free_bet}
                  onCheckedChange={setIsFreeBet}
                  className="data-[state=checked]:bg-emerald-500"
                  id="free-bet"
                />
                <Label htmlFor="free-bet" className="text-xs text-muted-foreground cursor-pointer">
                  Free bet (aposta grátis)
                </Label>
              </div>
            )}
          </div>

          {isMultiple && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Pernas da múltipla</Label>
                <div className="text-xs text-muted-foreground">
                  Odd total: <span className="font-mono font-semibold text-foreground">{calc.effectiveOdds.toFixed(3)}</span>
                  {" · "}Status: <span className="font-medium text-foreground">{STATUS_LABELS[calc.effectiveStatus]}</span>
                </div>
              </div>
              <LegsEditor legs={legs} onChange={setLegs} />
            </div>
          )}
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
            {!isMultiple && (
              <>
                <Field label="Evento" className="md:col-span-3">
                  <EventAutocomplete
                    value={event_name}
                    onChange={setEventName}
                    onPick={applyEventPick}
                  />
                </Field>
                <Field label="Mercado">
                  <MarketAutocomplete value={market} onChange={changeMarket} sport={sport} />
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
                  <Input type="number" step="0.001" min={1.01} value={odds || ""} onChange={(e) => setOdds(parseFloat(e.target.value) || 0)} />
                </Field>
              </>
            )}
            <Field label="Closing odd">
              <Input type="number" step="0.001" min={1.01} value={closing_odds ?? ""} onChange={(e) => setClosingOdds(e.target.value ? parseFloat(e.target.value) : undefined)} />
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
            {!isMultiple && (
              <Field label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as BetStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {!isMultiple && status === "cashout" && (
              <Field label="Retorno do cashout">
                <Input type="number" step="0.01" value={cashoutReturn ?? ""} onChange={(e) => setCashoutReturn(e.target.value ? parseFloat(e.target.value) : undefined)} />
              </Field>
            )}

            {isMultiple && (
              <Field label="Tipster">
                <TipsterAutocomplete value={tipster} onChange={setTipster} />
              </Field>
            )}
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

          {isMultiple && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Pernas da múltipla</Label>
                <div className="text-xs text-muted-foreground">
                  Odd total: <span className="font-mono font-semibold text-foreground">{calc.effectiveOdds.toFixed(3)}</span>
                  {" · "}Status: <span className="font-medium text-foreground">{STATUS_LABELS[calc.effectiveStatus]}</span>
                </div>
              </div>
              <LegsEditor legs={legs} onChange={setLegs} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="surface p-4 grid md:grid-cols-4 gap-3 text-sm">
        <Calc label="Prob. implícita" value={formatPercent(calc.implied)} />
        {/* Sem odd válida não há retorno/lucro a projetar — "—" evita o falso "-R$ 10,00". */}
        <Calc label="Retorno potencial" value={calc.effectiveOdds > 1 ? formatCurrency(calc.potentialReturn, currency) : "—"} />
        <Calc label="Lucro potencial" value={calc.effectiveOdds > 1 ? formatCurrency(stake_amount * (calc.effectiveOdds - 1), currency) : "—"} />
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
