import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBets, useDeleteBet, useUpdateBet, type Bet } from "@/hooks/useBets";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal, PlusCircle, Search, Pencil, Trash2, CheckCircle2, XCircle, MinusCircle, RotateCcw, LayoutGrid, Rows3 } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, computeNetProfit, computeGrossReturn, type BetStatus } from "@/lib/calc";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { BookmakerLogo } from "@/components/bookmakers/BookmakerLogo";
import { BetCard } from "@/components/bets/BetCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export default function Bets() {
  useEffect(() => { document.title = "Apostas · Bankroll Pro"; }, []);
  const { data: bets = [], isLoading } = useBets();
  const { data: profile } = useProfile();
  const updateBet = useUpdateBet();
  const deleteBet = useDeleteBet();
  const currency = profile?.currency ?? "BRL";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sport, setSport] = useState<string>("all");
  const [bookmaker, setBookmaker] = useState<string>("all");
  const [toDelete, setToDelete] = useState<Bet | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");

  const sports = useMemo(() => Array.from(new Set(bets.map((b) => b.sport).filter(Boolean) as string[])), [bets]);
  const books = useMemo(() => Array.from(new Set(bets.map((b) => b.bookmaker).filter(Boolean) as string[])), [bets]);

  const filtered = useMemo(() => {
    const lc = q.toLowerCase();
    return bets.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (sport !== "all" && b.sport !== sport) return false;
      if (bookmaker !== "all" && b.bookmaker !== bookmaker) return false;
      if (!lc) return true;
      return [b.event_name, b.market, b.selection, b.league, b.tipster, b.bookmaker, b.sport].some((f) =>
        (f ?? "").toLowerCase().includes(lc),
      );
    });
  }, [bets, q, status, sport, bookmaker]);

  const totals = useMemo(() => {
    const stake = filtered.reduce((s, b) => s + Number(b.stake_amount || 0), 0);
    const profit = filtered.reduce((s, b) => s + Number(b.net_profit || 0), 0);
    return { stake, profit, count: filtered.length };
  }, [filtered]);

  async function setStatusQuick(b: Bet, newStatus: BetStatus) {
    // A marcação rápida altera apenas o status: só net/gross dependem dele.
    // Os demais derivados (edge, ev, kelly, recommended_stake, clv) dependem de
    // odds/stake/prob/closing — inalterados aqui — então preservamos o que está salvo.
    const stake = Number(b.stake_amount);
    const odds = Number(b.odds);
    await updateBet.mutateAsync({
      id: b.id,
      patch: {
        status: newStatus,
        net_profit: computeNetProfit(newStatus, stake, odds),
        gross_return: computeGrossReturn(newStatus, stake, odds),
      },
    });
    toast.success(`Marcada como ${STATUS_LABELS[newStatus]}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Apostas</h1>
          <p className="text-sm text-muted-foreground">Todos os registros, com busca, filtros e edição rápida.</p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "cards" | "table")} variant="outline" size="sm">
            <ToggleGroupItem value="cards" aria-label="Cards"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Tabela"><Rows3 className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
          <Button asChild><Link to="/nova-aposta"><PlusCircle className="h-4 w-4 mr-2" />Nova aposta</Link></Button>
        </div>
      </div>

      <div className="surface p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento, mercado, seleção..." className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sport} onValueChange={setSport}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Esporte" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos esportes</SelectItem>
            {sports.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={bookmaker} onValueChange={setBookmaker}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Casa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas casas</SelectItem>
            {books.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totals.count}</span> apostas ·
          Stake <span className="font-mono">{formatCurrency(totals.stake, currency)}</span> ·
          Lucro <span className={`font-mono ${totals.profit > 0 ? "positive" : totals.profit < 0 ? "negative" : ""}`}>{formatCurrency(totals.profit, currency)}</span>
        </div>
      </div>

      {view === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {isLoading && <div className="surface p-8 text-center text-muted-foreground md:col-span-2 xl:col-span-3">Carregando...</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="surface p-8 text-center text-muted-foreground md:col-span-2 xl:col-span-3">Nenhuma aposta encontrada.</div>
          )}
          {filtered.map((b) => (
            <BetCard
              key={b.id}
              bet={b}
              currency={currency}
              unitValue={profile?.unit_value}
              onStatus={setStatusQuick}
              onDelete={setToDelete}
            />
          ))}
        </div>
      ) : (
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Esporte</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Mercado / Seleção</TableHead>
              <TableHead>Casa</TableHead>
              <TableHead className="text-right">Odd</TableHead>
              <TableHead className="text-right">Stake</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Lucro</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhuma aposta encontrada.</TableCell></TableRow>}
            {filtered.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(b.bet_date)}</TableCell>
                <TableCell>{b.sport || "—"}</TableCell>
                <TableCell>
                  <div className="font-medium">{b.event_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{b.league || ""}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{b.market || "—"}</div>
                  <div className="text-xs text-muted-foreground">{b.selection || ""}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-2">
                    <BookmakerLogo name={b.bookmaker} size="xs" />
                    <span className="truncate">{b.bookmaker || "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{formatNumber(Number(b.odds), 2)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(Number(b.stake_amount), currency)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_COLORS[b.status]}>{STATUS_LABELS[b.status]}</Badge>
                </TableCell>
                <TableCell className={`text-right font-mono ${Number(b.net_profit) > 0 ? "positive" : Number(b.net_profit) < 0 ? "negative" : ""}`}>
                  {b.net_profit != null ? formatCurrency(Number(b.net_profit), currency) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setStatusQuick(b, "green")}><CheckCircle2 className="h-4 w-4 mr-2 text-success" />Marcar Green</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusQuick(b, "red")}><XCircle className="h-4 w-4 mr-2 text-destructive" />Marcar Red</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusQuick(b, "void")}><MinusCircle className="h-4 w-4 mr-2" />Marcar Void</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusQuick(b, "pendente")}><RotateCcw className="h-4 w-4 mr-2" />Voltar a pendente</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild><Link to={`/apostas/${b.id}`}><Pencil className="h-4 w-4 mr-2" />Editar</Link></DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setToDelete(b)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aposta?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (toDelete) { await deleteBet.mutateAsync(toDelete.id); toast.success("Aposta excluída"); setToDelete(null); }
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}