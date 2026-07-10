import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useBets } from "@/hooks/useBets";
import { useTransactions } from "@/hooks/useTransactions";
import { useProfile } from "@/hooks/useProfile";
import { StatCard } from "@/components/StatCard";
import { computeBankroll, computeMetrics, groupBy } from "@/lib/metrics";
import { computeInsights, type InsightSeverity } from "@/lib/insights";
import { buildAnalyticsUrl, currentMonthRange, getBetGroupKey } from "@/lib/analyticsUrl";
import { formatCurrency, formatNumber, formatPercent, formatWithUnits } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, Activity, Target, Flame, PlusCircle, ArrowUpRight, Banknote, ListChecks, Percent, Dices, Coins, CalendarDays, AlertTriangle, Info, Lightbulb } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar, Cell, Legend, PieChart, Pie } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { isSettled, STATUS_LABELS } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/CountUp";
import { DUR, EASE, RISE, STAGGER } from "@/lib/motion";
import { RANGE_PRESETS } from "@/lib/constants";

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.1 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: RISE },
  visible: { opacity: 1, y: 0, transition: { duration: DUR.reveal, ease: EASE.out } },
};


export default function Dashboard() {
  const [chartDays, setChartDays] = useState<number | null>(30);
  useEffect(() => { document.title = "Dashboard · Bankroll Pro"; }, []);
  useEffect(() => {
    let touchedChart: Element | null = null;
    let dismissTimeout: ReturnType<typeof setTimeout> | null = null;
    const dismissChart = () => {
      if (!touchedChart) return;
      touchedChart.querySelectorAll<SVGElement>("svg.recharts-surface").forEach((svg) => {
        svg.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      });
      touchedChart = null;
      if (dismissTimeout) { clearTimeout(dismissTimeout); dismissTimeout = null; }
    };
    const scheduleDismiss = () => {
      if (dismissTimeout) clearTimeout(dismissTimeout);
      dismissTimeout = setTimeout(dismissChart, 4000);
    };
    const onTouchStart = (e: TouchEvent) => {
      const wrapper = (e.target as HTMLElement)?.closest?.(".recharts-wrapper");
      if (wrapper) {
        dismissChart();
        touchedChart = wrapper;
        scheduleDismiss();
      } else {
        dismissChart();
      }
    };
    const onScrollOrTouchMove = () => {
      if (touchedChart) dismissChart();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onScrollOrTouchMove, { passive: true });
    document.addEventListener("scroll", onScrollOrTouchMove, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onScrollOrTouchMove);
      document.removeEventListener("scroll", onScrollOrTouchMove);
      if (dismissTimeout) clearTimeout(dismissTimeout);
    };
  }, []);
  const navigate = useNavigate();
  const { data: bets = [], isLoading } = useBets();
  const { data: txs = [] } = useTransactions();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "BRL";
  const reduce = useReducedMotion();
  const monthRange = useMemo(() => currentMonthRange(), []);
  const chartCutoff = useMemo(() => {
    if (chartDays == null) return null;
    const d = new Date();
    d.setDate(d.getDate() - chartDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [chartDays]);

  const metrics = useMemo(() => computeMetrics(bets), [bets]);
  const insights = useMemo(() => computeInsights(bets, { currency, unitValue: profile?.unit_value }).slice(0, 5), [bets, currency, profile?.unit_value]);
  const bank = useMemo(() => computeBankroll(Number(profile?.initial_bankroll ?? 0), bets, txs), [bets, txs, profile]);
  const initialBankroll = Number(profile?.initial_bankroll ?? 0);
  const roi = initialBankroll > 0 ? (bank.betsProfit / initialBankroll) * 100 : 0;

  const cumChart = useMemo(() => {
    const settled = bets
      .filter((b) => isSettled(b.status))
      .slice()
      .sort((a, b) => new Date(a.bet_date).getTime() - new Date(b.bet_date).getTime());
    // Resultado por dia (diario). O acumulado (total) e RELATIVO ao periodo:
    // filtra pelo cutoff ANTES de acumular, entao a linha zera no inicio do recorte.
    const cutoff = chartCutoff?.getTime() ?? -Infinity;
    const diarioPorDia = new Map<number, number>();
    for (const b of settled) {
      const d = new Date(b.bet_date);
      d.setHours(0, 0, 0, 0);
      const t = d.getTime();
      if (t < cutoff) continue;
      diarioPorDia.set(t, (diarioPorDia.get(t) ?? 0) + Number(b.net_profit || 0));
    }
    let cum = 0;
    const byDay = new Map<number, { diario: number; total: number }>();
    for (const t of Array.from(diarioPorDia.keys()).sort((a, b) => a - b)) {
      const diario = diarioPorDia.get(t) ?? 0;
      cum += diario;
      byDay.set(t, { diario, total: cum });
    }
    const points = Array.from(byDay, ([t, v]) => ({ t, ...v }));
    if (points.length === 0) {
      points.push({ t: Date.now(), diario: 0, total: 0 });
    }
    return points;
  }, [bets, profile, chartCutoff]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bets) {
      if (!isSettled(b.status)) continue;
      if (chartCutoff && new Date(b.bet_date) < chartCutoff) continue;
      const d = new Date(b.bet_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) ?? 0) + Number(b.net_profit || 0));
    }
    const keys = Array.from(m.keys()).sort();
    if (keys.length === 0) return [];
    const out: { month: string; profit: number }[] = [];
    const [fy, fm] = keys[0].split("-").map(Number);
    const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
    for (let y = fy, mo = fm; y < ly || (y === ly && mo <= lm); mo === 12 ? (y++, mo = 1) : mo++) {
      const key = `${y}-${String(mo).padStart(2, "0")}`;
      out.push({ month: key, profit: m.get(key) ?? 0 });
    }
    return out;
  }, [bets, chartCutoff]);

  const statusBreak = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bets) m.set(b.status, (m.get(b.status) ?? 0) + 1);
    const ORDER: Array<{ key: string; color: string }> = [
      { key: "green", color: "hsl(var(--success))" },
      { key: "half_green", color: "hsl(var(--success))" },
      { key: "red", color: "hsl(var(--destructive))" },
      { key: "half_red", color: "hsl(var(--destructive))" },
      { key: "cashout", color: "hsl(var(--accent))" },
      { key: "void", color: "hsl(var(--muted-foreground))" },
      { key: "pendente", color: "hsl(var(--muted-foreground))" },
    ];
    const total = bets.length || 1;
    const segments = ORDER
      .filter((o) => (m.get(o.key) ?? 0) > 0)
      .map((o) => ({
        key: o.key,
        color: o.color,
        label: STATUS_LABELS[o.key as keyof typeof STATUS_LABELS] ?? o.key,
        count: m.get(o.key) ?? 0,
      }));
    const row: Record<string, number | string> = { name: "status" };
    for (const s of segments) row[s.key] = (s.count / total) * 100;
    return { segments, row: [row], total };
  }, [bets]);

  const bySport = useMemo(
    () =>
      groupBy(
        bets.filter((b) => isSettled(b.status)),
        (b) => getBetGroupKey(b, "esporte"),
      ).map((g) => ({ name: g.key, lucro: g.metrics.netProfit })),
    [bets],
  );

  const now = new Date();
  const monthBets = bets.filter((b) => {
    const d = new Date(b.bet_date);
    return isSettled(b.status) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthProfit = monthBets.reduce((s, b) => s + Number(b.net_profit || 0), 0);

  const prevRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthBets = bets.filter((b) => {
    const d = new Date(b.bet_date);
    return isSettled(b.status) && d.getMonth() === prevRef.getMonth() && d.getFullYear() === prevRef.getFullYear();
  });
  const prevMonthProfit = prevMonthBets.reduce((s, b) => s + Number(b.net_profit || 0), 0);
  const monthDelta = monthProfit - prevMonthProfit;
  const monthHint =
    prevMonthBets.length > 0
      ? `${monthDelta >= 0 ? "↑" : "↓"} ${formatCurrency(Math.abs(monthDelta), currency, profile?.unit_value)} vs mês anterior`
      : undefined;

  const streakTo =
    metrics.currentStreak.type === "green"
      ? buildAnalyticsUrl({ status: "green" })
      : metrics.currentStreak.type === "red"
        ? buildAnalyticsUrl({ status: "red" })
        : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">Resumo da sua operação de apostas.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/nova-aposta"><PlusCircle className="h-4 w-4 mr-2" />Nova aposta</Link></Button>
          <Button asChild variant="outline"><Link to="/apostas">Ver apostas <ArrowUpRight className="h-4 w-4 ml-1" /></Link></Button>
        </div>
      </div>

      {bets.length === 0 && !isLoading && (
        <div className="surface p-6 text-center">
          <h3 className="font-semibold">Sem apostas ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">Comece registrando sua primeira aposta ou importando um CSV.</p>
          <div className="flex justify-center gap-2">
            <Button asChild><Link to="/nova-aposta">Registrar aposta</Link></Button>
            <Button asChild variant="outline"><Link to="/importar">Importar CSV</Link></Button>
          </div>
        </div>
      )}

      {isLoading && bets.length === 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="surface p-4 space-y-3">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-0">
          <motion.div variants={fadeUp}><StatCard size="lg" label="Banca atual" value={<CountUp value={bank.current} format={(n) => formatCurrency(n, currency, profile?.unit_value)} />} icon={Wallet} hint={`Inicial ${formatCurrency(profile?.initial_bankroll ?? 0, currency, profile?.unit_value)}`} to="/bankroll" /></motion.div>
          <motion.div variants={fadeUp}><StatCard size="lg" label="Lucro / prejuízo" value={<CountUp value={metrics.netProfit} format={(n) => formatCurrency(n, currency, profile?.unit_value)} />} icon={metrics.netProfit >= 0 ? TrendingUp : TrendingDown} tone={metrics.netProfit > 0 ? "positive" : metrics.netProfit < 0 ? "negative" : "neutral"} to={buildAnalyticsUrl({ dateRange: "current" })} /></motion.div>
          <motion.div variants={fadeUp}><StatCard size="lg" label="ROI" value={<CountUp value={roi} format={(n) => formatPercent(n)} />} icon={Target} hint="sobre banca inicial" info="Retorno sobre a banca inicial: lucro total das apostas dividido pelo capital de partida." tone={roi > 0 ? "positive" : roi < 0 ? "negative" : "neutral"} to={buildAnalyticsUrl({ dateRange: "current" })} /></motion.div>
          <motion.div variants={fadeUp}><StatCard size="lg" label="Yield" value={<CountUp value={metrics.yield} format={(n) => formatPercent(n)} />} icon={Activity} info="Lucro dividido pelo total apostado (turnover). Mede a eficiência por real arriscado — 5%+ sustentado é forte." tone={metrics.yield > 0 ? "positive" : metrics.yield < 0 ? "negative" : "neutral"} to={buildAnalyticsUrl({ tab: "mercado" })} /></motion.div>
        </motion.div>
      )}

      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-0">
        <motion.div variants={fadeUp}><StatCard label="Total apostado" value={formatCurrency(metrics.stakeTotal, currency, profile?.unit_value)} icon={Banknote} to={buildAnalyticsUrl()} /></motion.div>
        <motion.div variants={fadeUp}><StatCard label="Apostas" value={formatNumber(metrics.totalBets, 0)} icon={ListChecks} hint={`${metrics.settledBets} liquidadas · ${metrics.pendingBets} pendentes`} to={buildAnalyticsUrl()} /></motion.div>
        <motion.div variants={fadeUp}><StatCard label="Taxa de acerto" value={formatPercent(metrics.hitRate, 1)} icon={Percent} info="Apostas ganhas sobre o total decidido (voids e pendentes fora). Sozinha não diz lucro — depende das odds." to={buildAnalyticsUrl({ view: "winrate" })} /></motion.div>
        <motion.div variants={fadeUp}><StatCard label="Odd média" value={formatNumber(metrics.avgOdds, 2)} icon={Dices} to={buildAnalyticsUrl({ tab: "odds" })} /></motion.div>
        <motion.div variants={fadeUp}><StatCard label="Stake média" value={formatCurrency(metrics.avgStake, currency, profile?.unit_value)} icon={Coins} to={buildAnalyticsUrl({ minStake: Math.round(metrics.avgStake) })} /></motion.div>
        <motion.div variants={fadeUp}><StatCard label="Maior drawdown" value={formatCurrency(metrics.maxDrawdown, currency, profile?.unit_value)} icon={TrendingDown} info="Maior queda acumulada desde um pico de lucro. Mede o pior momento da banca — quanto menor, mais estável." tone="negative" to={buildAnalyticsUrl()} /></motion.div>
        <motion.div variants={fadeUp}>
          <StatCard
            label="Sequência atual"
            value={metrics.currentStreak.type === "none" ? "—" : `${metrics.currentStreak.count} ${metrics.currentStreak.type === "green" ? (metrics.currentStreak.count === 1 ? "ganha" : "ganhas") : (metrics.currentStreak.count === 1 ? "perdida" : "perdidas")}`}
            icon={Flame}
            tone={metrics.currentStreak.type === "green" ? "positive" : metrics.currentStreak.type === "red" ? "negative" : "neutral"}
            to={streakTo}
          />
        </motion.div>
        <motion.div variants={fadeUp}><StatCard label="Resultado do mês" value={formatCurrency(monthProfit, currency, profile?.unit_value)} icon={CalendarDays} hint={monthHint} tone={monthProfit > 0 ? "positive" : monthProfit < 0 ? "negative" : "neutral"} to={buildAnalyticsUrl({ start: monthRange.start, end: monthRange.end })} /></motion.div>
      </motion.div>

      {insights.length > 0 && (
        <div className="surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Insights</h3>
          </div>
          <ul className="space-y-2.5">
            {insights.map((ins) => (
              <li key={ins.id} className="flex items-start gap-2.5 text-sm">
                <InsightIcon severity={ins.severity} />
                <span className="text-foreground/90">{ins.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-1">
        {RANGE_PRESETS.map((r) => (
          <Button
            key={r.label}
            type="button"
            size="sm"
            variant={chartDays === r.days ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setChartDays(r.days)}
          >
            {r.label}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground ml-2">Período dos gráficos</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 min-w-0 overflow-x-hidden">
        <ChartCard title="Resultado diário & acumulado" className="lg:col-span-2 min-w-0">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={cumChart}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                minTickGap={48}
                tickFormatter={(t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                formatter={(v: number) => formatWithUnits(v, currency, profile?.unit_value)}
                labelFormatter={(t: number) => new Date(t).toLocaleDateString("pt-BR")}
              />
              <Line type="monotone" dataKey="total" name="Acumulado" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={!reduce} />
              <Line type="monotone" dataKey="diario" name="Diário" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={!reduce} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status das apostas">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                formatter={(value: number, _n: string, entry: { payload?: { key?: string; label?: string; count?: number } }) => {
                  const p = entry?.payload;
                  const pct = ((p?.count ?? 0) / statusBreak.total) * 100;
                  return [`${p?.count ?? 0} (${pct.toFixed(1)}%)`, p?.label ?? ""];
                }}
              />
              <Legend
                verticalAlign="bottom"
                formatter={(_value: string, entry: { payload?: { label?: string } }) => entry?.payload?.label ?? ""}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Pie
                data={statusBreak.segments}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                isAnimationActive={!reduce}
                onClick={(d: { key?: string }) => { if (d?.key) navigate(buildAnalyticsUrl({ status: d.key })); }}
                className="cursor-pointer"
              >
                {statusBreak.segments.map((s) => (
                  <Cell key={s.key} fill={s.color} stroke="hsl(var(--background))" strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Resultado por mês" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }} formatter={(v: number) => formatWithUnits(v, currency, profile?.unit_value)} />
              <Bar
                dataKey="profit"
                name="Lucro"
                radius={[4, 4, 0, 0]}
                className="cursor-pointer"
                onClick={(data: { month?: string }) => {
                  if (data?.month) navigate(buildAnalyticsUrl({ tab: "mes", group: data.month }));
                }}
              >
                {byMonth.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                    className="motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-100 opacity-90"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lucro por esporte">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bySport} layout="vertical">
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} width={95} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }} formatter={(v: number) => formatWithUnits(v, currency, profile?.unit_value)} />
              <Bar
                dataKey="lucro"
                name="Lucro"
                radius={[0, 4, 4, 0]}
                className="cursor-pointer"
                onClick={(data: { name?: string }) => {
                  if (data?.name) navigate(buildAnalyticsUrl({ tab: "esporte", group: data.name }));
                }}
              >
                {bySport.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.lucro >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                    className="motion-safe:transition-opacity motion-safe:duration-150 hover:opacity-100 opacity-90"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function InsightIcon({ severity }: { severity: InsightSeverity }) {
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />;
  if (severity === "positive") return <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-success" />;
  return <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />;
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("surface p-4", className)}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}
