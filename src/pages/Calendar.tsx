import { useEffect, useMemo, useState } from "react";
import { useBets } from "@/hooks/useBets";
import { useProfile } from "@/hooks/useProfile";
import { isSettled, STATUS_COLORS, STATUS_LABELS } from "@/lib/calc";
import { formatCurrency, formatNumber, formatTime, toLocalDateKey } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function CalendarPage() {
  useEffect(() => { document.title = "Calendário · Bankroll Pro"; }, []);
  const { data: bets = [] } = useBets();
  const { data: profile } = useProfile();
  const currency = profile?.currency ?? "BRL";

  const [cursor, setCursor] = useState(() => new Date());
  const [openDay, setOpenDay] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = first.getDay();

  const byDay = useMemo(() => {
    const m = new Map<string, { profit: number; count: number }>();
    for (const b of bets) {
      const d = new Date(b.bet_date);
      if (d.getMonth() !== month || d.getFullYear() !== year) continue;
      const key = toLocalDateKey(d);
      const cur = m.get(key) ?? { profit: 0, count: 0 };
      cur.count++;
      if (isSettled(b.status)) cur.profit += Number(b.net_profit || 0);
      m.set(key, cur);
    }
    return m;
  }, [bets, year, month]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthBets = bets.filter((b) => {
    const d = new Date(b.bet_date);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const monthProfit = monthBets.filter((b) => isSettled(b.status)).reduce((s, b) => s + Number(b.net_profit || 0), 0);

  const dayBets = openDay
    ? bets
        .filter((b) => toLocalDateKey(b.bet_date) === openDay)
        .sort((a, b) => {
          const ta = a.event_date ? new Date(a.event_date).getTime() : Number.MAX_SAFE_INTEGER;
          const tb = b.event_date ? new Date(b.event_date).getTime() : Number.MAX_SAFE_INTEGER;
          return ta - tb;
        })
    : [];
  const dayProfit = dayBets.filter((b) => isSettled(b.status)).reduce((s, b) => s + Number(b.net_profit || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendário</h1>
          <p className="text-sm text-muted-foreground">Visualize resultados diários em um heatmap mensal.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-medium min-w-[160px] text-center capitalize">
            {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(cursor)}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Hoje</Button>
        </div>
      </div>

      <div className="surface p-4">
        <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground mb-2">
          {WEEK.map((w) => <div key={w} className="text-center font-medium">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((d, i) => {
            if (d == null) return <div key={i} />;
            const key = toLocalDateKey(new Date(year, month, d));
            const info = byDay.get(key);
            const profit = info?.profit ?? 0;
            const count = info?.count ?? 0;
            return (
              <button
                key={i}
                onClick={() => count > 0 && setOpenDay(key)}
                className={cn(
                  "aspect-square rounded-lg p-2 border text-left flex flex-col justify-between transition overflow-hidden min-w-0",
                  count === 0 && "border-border/60 bg-muted/30 text-muted-foreground",
                  count > 0 && profit > 0 && "border-success/40 bg-success/10 hover:bg-success/15",
                  count > 0 && profit < 0 && "border-destructive/40 bg-destructive/10 hover:bg-destructive/15",
                  count > 0 && profit === 0 && "border-border bg-card hover:bg-secondary",
                )}
              >
                <div className="text-xs font-medium">{d}</div>
                {count > 0 && (
                  <div className="text-right overflow-hidden">
                    <div className={cn("hidden sm:block text-xs font-mono", profit > 0 ? "positive" : profit < 0 ? "negative" : "neutral")}>
                      {formatCurrency(profit, currency, profile?.unit_value)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{count} aposta{count > 1 ? "s" : ""}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mt-3">
          Resultado do mês: <span className={cn("font-mono font-semibold", monthProfit > 0 ? "positive" : monthProfit < 0 ? "negative" : "")}>{formatCurrency(monthProfit, currency, profile?.unit_value)}</span>
        </div>
      </div>

      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-baseline justify-between gap-3 pr-6">
              <span>Apostas em {openDay && new Date(`${openDay}T00:00:00`).toLocaleDateString("pt-BR")}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {dayBets.length} aposta{dayBets.length !== 1 ? "s" : ""} ·{" "}
                <span className={cn("font-mono font-semibold", dayProfit > 0 ? "positive" : dayProfit < 0 ? "negative" : "")}>
                  {formatCurrency(dayProfit, currency, profile?.unit_value)}
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {dayBets.map((b) => {
              const net = b.status !== "pendente" && b.net_profit != null ? Number(b.net_profit) : null;
              const time = formatTime(b.event_date);
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 border border-border rounded-lg">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {time && <span className="font-mono text-xs text-muted-foreground shrink-0">{time}</span>}
                      <span className="font-medium truncate">{b.event_name || "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[b.market, b.selection].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 font-mono tabular-nums text-xs text-muted-foreground">
                    <span title="Odd">@{formatNumber(Number(b.odds), 2)}</span>
                    <span title="Stake">{formatCurrency(Number(b.stake_amount), currency, profile?.unit_value)}</span>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", STATUS_COLORS[b.status])}>{STATUS_LABELS[b.status]}</Badge>
                  <div className={cn("font-mono text-sm tabular-nums min-w-[84px] text-right shrink-0", net != null && net > 0 ? "positive" : net != null && net < 0 ? "negative" : "")}>
                    {net != null ? formatCurrency(net, currency, profile?.unit_value) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
