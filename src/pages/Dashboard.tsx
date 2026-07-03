import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useBets } from "@/hooks/useBets";
import { useTransactions } from "@/hooks/useTransactions";
import { useProfile } from "@/hooks/useProfile";
import { StatCard } from "@/components/StatCard";
import { computeBankroll, computeMetrics, groupBy } from "@/lib/metrics";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, Activity, Target, Flame, PlusCircle, ArrowUpRight, Banknote, ListChecks, Percent, Dices, Coins, CalendarDays } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import { isSettled, STATUS_LABELS } from "@/lib/calc";

export default function Dashboard() {
  useEffect(() => { document.title = "Dashboard · Bankroll Pro"; }, []);
  const { data: bets = [], isLoading } = useBets();
  const { data: txs = [] } = useTransactions();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "BRL";

  const metrics = useMemo(() => computeMetrics(bets), [bets]);
  const bank = useMemo(() => computeBankroll(Number(profile?.initial_bankroll ?? 0), bets, txs), [bets, txs, profile]);
  // ROI = lucro das apostas sobre a banca inicial (crescimento do capital de partida).
  const initialBankroll = Number(profile?.initial_bankroll ?? 0);
  const roi = initialBankroll > 0 ? (bank.betsProfit / initialBankroll) * 100 : 0;

  const evolution = useMemo(() => {
    const settled = bets
      .filter((b) => isSettled(b.status))
      .slice()
      .sort((a, b) => new Date(a.bet_date).getTime() - new Date(b.bet_date).getTime());
    let cum = Number(profile?.initial_bankroll ?? 0);
    // Eixo numérico (timestamp) + agregado por dia (banca no fim do dia):
    // vários pontos no mesmo dia viravam penhascos verticais na linha.
    const byDay = new Map<number, number>();
    for (const b of settled) {
      cum += Number(b.net_profit || 0);
      const d = new Date(b.bet_date);
      d.setHours(0, 0, 0, 0);
      byDay.set(d.getTime(), cum);
    }
    const points = Array.from(byDay, ([t, banca]) => ({ t, banca }));
    if (points.length === 0) {
      points.push({ t: Date.now(), banca: Number(profile?.initial_bankroll ?? 0) });
    }
    return points;
  }, [bets, profile]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bets) {
      if (!isSettled(b.status)) continue;
      const d = new Date(b.bet_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) ?? 0) + Number(b.net_profit || 0));
    }
    const keys = Array.from(m.keys()).sort();
    if (keys.length === 0) return [];
    // Preenche meses sem apostas com 0 — sem isso o eixo colava 2024-01 em 2026-06.
    const out: { month: string; profit: number }[] = [];
    const [fy, fm] = keys[0].split("-").map(Number);
    const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
    for (let y = fy, mo = fm; y < ly || (y === ly && mo <= lm); mo === 12 ? (y++, mo = 1) : mo++) {
      const key = `${y}-${String(mo).padStart(2, "0")}`;
      out.push({ month: key, profit: m.get(key) ?? 0 });
    }
    return out;
  }, [bets]);

  const statusBreak = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bets) m.set(b.status, (m.get(b.status) ?? 0) + 1);
    return Array.from(m.entries()).map(([k, v]) => ({ status: STATUS_LABELS[k as keyof typeof STATUS_LABELS] ?? k, count: v, key: k }));
  }, [bets]);

  const bySport = useMemo(
    // `|| "Outro"` (não `??`): esporte com string vazia gerava barra fantasma sem rótulo.
    () => groupBy(bets.filter((b) => isSettled(b.status)), (b) => (b.sport && b.sport.trim()) || "Outro").map((g) => ({ name: g.key, lucro: g.metrics.netProfit })),
    [bets],
  );

  const now = new Date();
  const monthBets = bets.filter((b) => {
    const d = new Date(b.bet_date);
    return isSettled(b.status) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthProfit = monthBets.reduce((s, b) => s + Number(b.net_profit || 0), 0);

  // Comparação com o mês anterior (delta absoluto — % entre lucros de sinais
  // diferentes não tem interpretação válida).
  const prevRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthBets = bets.filter((b) => {
    const d = new Date(b.bet_date);
    return isSettled(b.status) && d.getMonth() === prevRef.getMonth() && d.getFullYear() === prevRef.getFullYear();
  });
  const prevMonthProfit = prevMonthBets.reduce((s, b) => s + Number(b.net_profit || 0), 0);
  const monthDelta = monthProfit - prevMonthProfit;
  const monthHint =
    prevMonthBets.length > 0
      ? `${monthDelta >= 0 ? "↑" : "↓"} ${formatCurrency(Math.abs(monthDelta), currency)} vs mês anterior`
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

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard label="Banca atual" value={formatCurrency(bank.current, currency)} icon={Wallet} hint={`Inicial ${formatCurrency(profile?.initial_bankroll ?? 0, currency)}`} />
        <StatCard label="Lucro / prejuízo" value={formatCurrency(metrics.netProfit, currency)} icon={metrics.netProfit >= 0 ? TrendingUp : TrendingDown} tone={metrics.netProfit > 0 ? "positive" : metrics.netProfit < 0 ? "negative" : "neutral"} />
        <StatCard label="ROI" value={formatPercent(roi)} icon={Target} hint="sobre banca inicial" info="Retorno sobre a banca inicial: lucro total das apostas dividido pelo capital de partida." tone={roi > 0 ? "positive" : roi < 0 ? "negative" : "neutral"} />
        <StatCard label="Yield" value={formatPercent(metrics.yield)} icon={Activity} info="Lucro dividido pelo total apostado (turnover). Mede a eficiência por real arriscado — 5%+ sustentado é forte." tone={metrics.yield > 0 ? "positive" : metrics.yield < 0 ? "negative" : "neutral"} />
        <StatCard label="Total apostado" value={formatCurrency(metrics.stakeTotal, currency)} icon={Banknote} />
        <StatCard label="Apostas" value={formatNumber(metrics.totalBets, 0)} icon={ListChecks} hint={`${metrics.settledBets} liquidadas · ${metrics.pendingBets} pendentes`} />
        <StatCard label="Taxa de acerto" value={formatPercent(metrics.hitRate, 1)} icon={Percent} info="Apostas ganhas sobre o total decidido (voids e pendentes fora). Sozinha não diz lucro — depende das odds." />
        <StatCard label="Odd média" value={formatNumber(metrics.avgOdds, 2)} icon={Dices} />
        <StatCard label="Stake média" value={formatCurrency(metrics.avgStake, currency)} icon={Coins} />
        <StatCard label="Maior drawdown" value={formatCurrency(metrics.maxDrawdown, currency)} icon={TrendingDown} info="Maior queda acumulada desde um pico de lucro. Mede o pior momento da banca — quanto menor, mais estável." tone="negative" />
        <StatCard
          label="Sequência atual"
          value={metrics.currentStreak.type === "none" ? "—" : `${metrics.currentStreak.count} ${metrics.currentStreak.type === "green" ? "ganhas" : "perdidas"}`}
          icon={Flame}
          tone={metrics.currentStreak.type === "green" ? "positive" : metrics.currentStreak.type === "red" ? "negative" : "neutral"}
        />
        <StatCard label="Resultado do mês" value={formatCurrency(monthProfit, currency)} icon={CalendarDays} hint={monthHint} tone={monthProfit > 0 ? "positive" : monthProfit < 0 ? "negative" : "neutral"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <ChartCard title="Evolução da banca" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={evolution}>
              <defs>
                <linearGradient id="bk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                formatter={(v: number) => formatCurrency(v, currency)}
                labelFormatter={(t: number) => new Date(t).toLocaleDateString("pt-BR")}
              />
              <Area type="monotone" dataKey="banca" name="Banca" stroke="hsl(var(--primary))" fill="url(#bk)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status das apostas">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusBreak}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }} />
              <Bar dataKey="count" name="Apostas" radius={[4,4,0,0]}>
                {statusBreak.map((s) => (
                  <Cell key={s.key} fill={
                    s.key === "green" || s.key === "half_green" ? "hsl(var(--success))" :
                    s.key === "red" || s.key === "half_red" ? "hsl(var(--destructive))" :
                    s.key === "cashout" ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))"
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Resultado por mês" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }} formatter={(v: number) => formatCurrency(v, currency)} />
              <Bar dataKey="profit" name="Lucro" radius={[4,4,0,0]}>
                {byMonth.map((d, i) => <Cell key={i} fill={d.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />)}
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
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }} cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }} formatter={(v: number) => formatCurrency(v, currency)} />
              <Bar dataKey="lucro" name="Lucro" radius={[0,4,4,0]}>
                {bySport.map((d, i) => <Cell key={i} fill={d.lucro >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`surface p-4 ${className ?? ""}`}>
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}
