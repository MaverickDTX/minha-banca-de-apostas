import { useEffect, useMemo, useState } from "react";
import { useTransactions, useCreateTransaction, useDeleteTransaction, TX_LABELS, type TxType } from "@/hooks/useTransactions";
import { useBets } from "@/hooks/useBets";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/StatCard";
import { computeBankroll, computeMetrics } from "@/lib/metrics";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, Sparkles, Wallet, PiggyBank, TrendingUp, TrendingDown, Target, Gauge, Ruler, ListChecks } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function BankrollPage() {
  useEffect(() => { document.title = "Bankroll · Bankroll Pro"; }, []);
  const { data: txs = [] } = useTransactions();
  const { data: bets = [] } = useBets();
  const { data: profile } = useProfile();
  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();
  const currency = profile?.currency ?? "BRL";

  const bank = useMemo(() => computeBankroll(Number(profile?.initial_bankroll ?? 0), bets, txs), [bets, txs, profile]);
  const metrics = useMemo(() => computeMetrics(bets), [bets]);
  const roiInitial = profile && Number(profile.initial_bankroll) > 0 ? (bank.betsProfit / Number(profile.initial_bankroll)) * 100 : 0;
  const roiCapital = bank.capitalDeposited > 0 ? (bank.betsProfit / bank.capitalDeposited) * 100 : 0;

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TxType>("deposit");
  const [amount, setAmount] = useState<number>(0);
  const [book, setBook] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) { toast.error("Informe um valor diferente de zero"); return; }
    if (type !== "adjustment" && amount < 0) { toast.error("Valor deve ser positivo"); return; }
    await createTx.mutateAsync({
      tx_date: new Date(date).toISOString(),
      tx_type: type, amount, bookmaker: book || null, notes: notes || null,
    });
    toast.success("Transação registrada");
    setOpen(false); setAmount(0); setBook(""); setNotes("");
  }

  // Composição da banca (cascata): de onde veio o valor atual.
  // Substitui o gráfico de evolução, que duplicava o do Dashboard.
  const waterfall = useMemo(() => {
    const steps = [
      { name: "Inicial", delta: Number(profile?.initial_bankroll ?? 0), always: true },
      { name: "Depósitos", delta: bank.deposits, always: false },
      { name: "Bônus", delta: bank.bonuses, always: false },
      { name: "Ajustes", delta: bank.adjustments, always: false },
      { name: "Saques", delta: -bank.withdrawals, always: false },
      { name: "Apostas", delta: bank.betsProfit, always: true },
    ].filter((s) => s.always || s.delta !== 0);
    let cum = 0;
    const rows = steps.map((s) => {
      const base = Math.min(cum, cum + s.delta);
      cum += s.delta;
      return { name: s.name, base, altura: Math.abs(s.delta), delta: s.delta, total: false };
    });
    rows.push({ name: "Atual", base: Math.min(0, cum), altura: Math.abs(cum), delta: cum, total: true });
    return rows;
  }, [bank, profile]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bankroll</h1>
          <p className="text-sm text-muted-foreground">Controle de entradas, saídas e evolução da banca.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova transação</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova transação</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Data</Label><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as TxType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TX_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor ({currency})</Label>
                <Input type="number" step="0.01" min={type === "adjustment" ? undefined : 0} value={amount || ""} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
                {type === "adjustment" && <p className="text-xs text-muted-foreground mt-1">Use valor negativo para reduzir a banca.</p>}
              </div>
              <div><Label>Casa de aposta (opcional)</Label><Input value={book} onChange={(e) => setBook(e.target.value)} /></div>
              <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard label="Banca atual" value={formatCurrency(bank.current, currency)} icon={Wallet} />
        <StatCard label="Banca inicial" value={formatCurrency(profile?.initial_bankroll ?? 0, currency)} icon={PiggyBank} />
        <StatCard label="Lucro de apostas" value={formatCurrency(bank.betsProfit, currency)} icon={bank.betsProfit >= 0 ? TrendingUp : TrendingDown} tone={bank.betsProfit > 0 ? "positive" : bank.betsProfit < 0 ? "negative" : "neutral"} />
        <StatCard label="Depósitos" value={formatCurrency(bank.deposits, currency)} icon={ArrowDownToLine} />
        <StatCard label="Saques" value={formatCurrency(bank.withdrawals, currency)} icon={ArrowUpFromLine} />
        <StatCard label="Bônus" value={formatCurrency(bank.bonuses, currency)} icon={Sparkles} />
        <StatCard label="ROI sobre banca inicial" value={formatPercent(roiInitial)} icon={Target} tone={roiInitial > 0 ? "positive" : roiInitial < 0 ? "negative" : "neutral"} />
        <StatCard label="ROI sobre capital" value={formatPercent(roiCapital)} icon={Gauge} tone={roiCapital > 0 ? "positive" : roiCapital < 0 ? "negative" : "neutral"} />
        <StatCard label="Unidade atual" value={formatCurrency(profile?.unit_value ?? 0, currency)} icon={Ruler} hint={profile?.unit_mode === "percent" ? `${profile?.unit_percent}% da banca` : "Fixa"} />
        <StatCard label="Apostas liquidadas" value={metrics.settledBets} icon={ListChecks} />
      </div>

      <div className="surface p-4">
        <h3 className="text-sm font-semibold mb-1">Composição da banca</h3>
        <p className="text-xs text-muted-foreground mb-3">Como a banca inicial virou a banca atual: cada barra soma (ou subtrai) sobre a anterior.</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={waterfall}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--popover-foreground))" }} itemStyle={{ color: "hsl(var(--popover-foreground))" }}
              formatter={(_v: number, _n: string, item: { payload?: { delta: number } }) =>
                formatCurrency(item?.payload?.delta ?? 0, currency)
              }
              labelFormatter={(l: string) => l}
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }}
            />
            {/* Base invisível empilha a barra na altura acumulada (waterfall). */}
            <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} tooltipType="none" />
            <Bar dataKey="altura" name="Variação" stackId="wf" radius={[4, 4, 0, 0]}>
              {waterfall.map((r, i) => (
                <Cell
                  key={i}
                  fill={
                    r.total || r.name === "Inicial"
                      ? "hsl(var(--accent))"
                      : r.delta >= 0
                        ? "hsl(var(--success))"
                        : "hsl(var(--destructive))"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Casa</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma transação registrada.</TableCell></TableRow>}
            {txs.map((t) => {
              const isOut = t.tx_type === "withdrawal" || Number(t.amount) < 0;
              return (
                <TableRow key={t.id}>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.tx_date)}</TableCell>
                  <TableCell>{TX_LABELS[t.tx_type]}</TableCell>
                  <TableCell className="text-sm">{t.bookmaker || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.notes || "—"}</TableCell>
                  <TableCell className={`text-right font-mono ${isOut ? "negative" : "positive"}`}>
                    {isOut ? "−" : "+"}{formatCurrency(Math.abs(Number(t.amount)), currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => deleteTx.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}