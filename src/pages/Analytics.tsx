import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useBets } from "@/hooks/useBets";
import { useProfile } from "@/hooks/useProfile";
import { computeMetrics, groupBy, oddsBucket } from "@/lib/metrics";
import { DUR } from "@/lib/motion";
import { CountUp } from "@/components/CountUp";
import {
  analyticsTabLabel,
  betMatchesGroup,
  currentMonthRange,
  parseAnalyticsPreset,
  parseAnalyticsTab,
  presetStartDate,
  type AnalyticsPreset,
  type AnalyticsTab,
} from "@/lib/analyticsUrl";
import { isSettled, STATUS_LABELS } from "@/lib/calc";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Cell, ScatterChart, Scatter } from "recharts";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PRESETS = [
  { key: "7" as const, days: 7, label: "7d" },
  { key: "14" as const, days: 14, label: "14d" },
  { key: "30" as const, days: 30, label: "30d" },
  { key: "90" as const, days: 90, label: "90d" },
  { key: "all" as const, days: null, label: "Tudo" },
];

export default function Analytics() {
  const reduce = useReducedMotion();
  useEffect(() => { document.title = "Análises · Bankroll Pro"; }, []);
  const { data: bets = [] } = useBets();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "BRL";
  const [searchParams, setSearchParams] = useSearchParams();

  const dateRange = searchParams.get("dateRange") || "";
  const from = dateRange === "current" ? currentMonthRange().start : searchParams.get("start") || "";
  const to = dateRange === "current" ? currentMonthRange().end : searchParams.get("end") || "";
  const minStake = searchParams.get("minStake");
  const status = searchParams.get("status") || "all";
  const preset = parseAnalyticsPreset(searchParams.get("preset")) || (from || to ? "" : "all");
  const tab = parseAnalyticsTab(searchParams.get("tab"));
  const group = searchParams.get("group") || "";

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  function applyPreset(key: AnalyticsPreset, days: number | null) {
    if (days == null) {
      patchParams({ preset: "all", start: null, end: null });
      return;
    }
    patchParams({ preset: key, start: presetStartDate(days), end: null });
  }

  const filtered = useMemo(() => {
    let rows = bets.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      const t = new Date(b.bet_date).getTime();
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime() + 86400000) return false;
      if (minStake && Number(b.stake_amount) < Number(minStake)) return false;
      return true;
    });
    if (group) {
      rows = rows.filter((b) => betMatchesGroup(b, tab, group));
    }
    return rows;
  }, [bets, from, to, status, tab, group, minStake]);

  const m = useMemo(() => computeMetrics(filtered), [filtered]);
  const settled = filtered.filter((b) => isSettled(b.status));
  const contentKey = `${preset}-${from}-${to}-${status}-${tab}-${group}-${minStake}`;

  const grouping = (rows: { key: string; bets: typeof bets; metrics: ReturnType<typeof computeMetrics> }[]) =>
    rows.sort((a, b) => b.metrics.netProfit - a.metrics.netProfit);

  const bySport = grouping(groupBy(settled, (b) => (b.sport && b.sport.trim()) || "—"));
  const byLeague = grouping(groupBy(settled, (b) => (b.league && b.league.trim()) || "—"));
  const byMarket = grouping(groupBy(settled, (b) => (b.market && b.market.trim()) || "—"));
  const byBook = grouping(groupBy(settled, (b) => (b.bookmaker && b.bookmaker.trim()) || "—"));
  const byOdds = grouping(groupBy(settled, (b) => oddsBucket(Number(b.odds))));
  const byDay = grouping(groupBy(settled, (b) => DAY_NAMES[new Date(b.bet_date).getDay()]));
  const byMonth = grouping(
    groupBy(settled, (b) => {
      const d = new Date(b.bet_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }),
  );
  const byTag = grouping(groupBy(settled, (b) => (b.tags && b.tags.length ? b.tags[0] : "—")));
  const byTipster = grouping(groupBy(settled, (b) => b.tipster ?? "—"));
  const byTiming = grouping(groupBy(settled, (b) => b.timing));
  const byType = grouping(groupBy(settled, (b) => b.bet_type));

  const cumChart = useMemo(() => {
    const ordered = settled.slice().sort((a, b) => new Date(a.bet_date).getTime() - new Date(b.bet_date).getTime());
    let cum = 0;
    let peak = 0;
    const byDayMap = new Map<number, { lucro: number; drawdown: number }>();
    for (const b of ordered) {
      cum += Number(b.net_profit || 0);
      peak = Math.max(peak, cum);
      const d = new Date(b.bet_date);
      d.setHours(0, 0, 0, 0);
      const t = d.getTime();
      const prev = byDayMap.get(t);
      byDayMap.set(t, {
        lucro: cum,
        drawdown: Math.min(prev?.drawdown ?? 0, cum - peak),
      });
    }
    return Array.from(byDayMap, ([t, v]) => ({ t, ...v }));
  }, [settled]);

  const oddsHist = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of settled) map.set(oddsBucket(Number(b.odds)), (map.get(oddsBucket(Number(b.odds))) ?? 0) + 1);
    const ORDER = ["1.01–1.49", "1.50–1.79", "1.80–2.09", "2.10–2.99", "3.00+"];
    return ORDER.map((k) => ({ faixa: k, n: map.get(k) ?? 0 }));
  }, [settled]);

  const scatter = useMemo(
    () => settled.map((b) => ({ stake: Number(b.stake_amount), lucro: Number(b.net_profit || 0) })),
    [settled],
  );

  const hasDeepLink = Boolean(group || status !== "all" || from || to || (preset && preset !== "all") || minStake);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Análises</h1>
        <p className="text-sm text-muted-foreground">Quebra de performance por dimensão. Use os filtros para refinar.</p>
      </div>

      <div className="surface p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 mr-1">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              type="button"
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              className="h-8 px-3"
              onClick={() => applyPreset(p.key, p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Input
          type="date"
          value={from}
          onChange={(e) => patchParams({ start: e.target.value || null, preset: null })}
          className="w-[160px]"
        />
        <span className="text-muted-foreground text-sm">até</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => patchParams({ end: e.target.value || null, preset: null })}
          className="w-[160px]"
        />
        <Select value={status} onValueChange={(v) => patchParams({ status: v === "all" ? null : v })}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {group && (
          <Badge
            variant="secondary"
            className="gap-1 pl-2.5 pr-1 h-8 animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none"
          >
            {analyticsTabLabel(tab)}: {group}
            <button
              type="button"
              aria-label="Remover filtro de grupo"
              className="rounded-sm p-0.5 hover:bg-muted"
              onClick={() => patchParams({ group: null })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          <CountUp value={m.totalBets} format={(n) => formatNumber(n, 0)} /> apostas · Lucro{" "}
          <span className={m.netProfit >= 0 ? "positive font-mono" : "negative font-mono"}>
            <CountUp value={m.netProfit} format={(n) => formatCurrency(n, currency)} />
          </span>{" "}
          · Yield <span className="font-mono"><CountUp value={m.yield} format={(n) => formatPercent(n)} /></span>
        </div>
      </div>

      <motion.div
        key={contentKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.state }}
        className="space-y-4"
      >
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="surface p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-3">Lucro acumulado & drawdown</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={cumChart}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  minTickGap={48}
                  tickFormatter={(t: number) =>
                    new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
                  }
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  formatter={(v: number) => formatCurrency(v, currency)}
                  labelFormatter={(t: number) => new Date(t).toLocaleDateString("pt-BR")}
                />
                <Line isAnimationActive={!reduce} type="monotone" dataKey="lucro" name="Lucro" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line isAnimationActive={!reduce} type="monotone" dataKey="drawdown" name="Drawdown" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="surface p-4">
            <h3 className="text-sm font-semibold mb-3">Histograma de odds</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={oddsHist}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="faixa" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
                />
                <Bar isAnimationActive={!reduce} dataKey="n" name="Apostas" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="surface p-4 lg:col-span-3">
            <h3 className="text-sm font-semibold mb-3">Stake × lucro (dispersão)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="stake" name="Stake" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis type="number" dataKey="lucro" name="Lucro" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  formatter={(v: number) => formatCurrency(v, currency)}
                />
                <Scatter isAnimationActive={!reduce} data={scatter}>
                  {scatter.map((p, i) => (
                    <Cell key={i} fill={p.lucro >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) =>
            patchParams({
              tab: v === "esporte" ? null : v,
              group: null,
            })
          }
        >
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="esporte">Esporte</TabsTrigger>
            <TabsTrigger value="liga">Liga</TabsTrigger>
            <TabsTrigger value="mercado">Mercado</TabsTrigger>
            <TabsTrigger value="casa">Casa</TabsTrigger>
            <TabsTrigger value="odds">Faixa de odds</TabsTrigger>
            <TabsTrigger value="dia">Dia da semana</TabsTrigger>
            <TabsTrigger value="mes">Mês</TabsTrigger>
            <TabsTrigger value="tag">Tag</TabsTrigger>
            <TabsTrigger value="tipster">Tipster</TabsTrigger>
            <TabsTrigger value="timing">Pré × Live</TabsTrigger>
            <TabsTrigger value="tipo">Simples × Múltiplas</TabsTrigger>
          </TabsList>
          <TabsContent value="esporte"><GroupTable rows={bySport} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="liga"><GroupTable rows={byLeague} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="mercado"><GroupTable rows={byMarket} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="casa"><GroupTable rows={byBook} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="odds"><GroupTable rows={byOdds} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="dia"><GroupTable rows={byDay} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="mes"><GroupTable rows={byMonth} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="tag"><GroupTable rows={byTag} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="tipster"><GroupTable rows={byTipster} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="timing"><GroupTable rows={byTiming} currency={currency} highlightKey={group} /></TabsContent>
          <TabsContent value="tipo"><GroupTable rows={byType} currency={currency} highlightKey={group} /></TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

function GroupTable({
  rows,
  currency,
  highlightKey,
}: {
  rows: { key: string; metrics: ReturnType<typeof computeMetrics> }[];
  currency: string;
  highlightKey?: string;
}) {
  return (
    <div className="surface overflow-x-auto mt-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Grupo</TableHead>
            <TableHead className="text-right">Apostas</TableHead>
            <TableHead className="text-right">Stake</TableHead>
            <TableHead className="text-right">Lucro</TableHead>
            <TableHead className="text-right">Yield</TableHead>
            <TableHead className="text-right">Acerto</TableHead>
            <TableHead className="text-right">Odd média</TableHead>
            <TableHead className="text-right">Stake média</TableHead>
            <TableHead className="text-right">CLV médio</TableHead>
            <TableHead className="text-right">EV médio</TableHead>
            <TableHead className="text-right">Maior green</TableHead>
            <TableHead className="text-right">Maior red</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-6">Sem dados.</TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow
              key={r.key}
              className={cn(highlightKey && r.key === highlightKey && "bg-primary/10")}
            >
              <TableCell className="font-medium">{r.key}</TableCell>
              <TableCell className="text-right">{r.metrics.totalBets}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(r.metrics.stakeTotal, currency)}</TableCell>
              <TableCell className={`text-right font-mono ${r.metrics.netProfit > 0 ? "positive" : r.metrics.netProfit < 0 ? "negative" : ""}`}>
                {formatCurrency(r.metrics.netProfit, currency)}
              </TableCell>
              <TableCell className={`text-right font-mono ${r.metrics.yield > 0 ? "positive" : r.metrics.yield < 0 ? "negative" : ""}`}>
                {formatPercent(r.metrics.yield)}
              </TableCell>
              <TableCell className="text-right font-mono">{formatPercent(r.metrics.hitRate, 1)}</TableCell>
              <TableCell className="text-right font-mono">{formatNumber(r.metrics.avgOdds, 2)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(r.metrics.avgStake, currency)}</TableCell>
              <TableCell className="text-right font-mono">{r.metrics.clvCount > 0 ? formatPercent(r.metrics.avgClv) : "—"}</TableCell>
              <TableCell className="text-right font-mono">{r.metrics.evCount > 0 ? formatCurrency(r.metrics.avgEv, currency) : "—"}</TableCell>
              <TableCell className="text-right font-mono positive">{formatCurrency(r.metrics.bestGreen, currency)}</TableCell>
              <TableCell className="text-right font-mono negative">{formatCurrency(r.metrics.worstRed, currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
