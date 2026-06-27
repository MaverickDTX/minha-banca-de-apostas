import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBets, useDeleteBet, useUpdateBet, useBulkUpdateBets, type Bet, type BetInput } from "@/hooks/useBets";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal, PlusCircle, Search, Pencil, Trash2, CheckCircle2, XCircle, MinusCircle, RotateCcw, LayoutGrid, Rows3, ChevronLeft, ChevronRight } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS, computeNetProfit, computeGrossReturn, type BetStatus } from "@/lib/calc";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { BookmakerLogo } from "@/components/bookmakers/BookmakerLogo";
import { BetCard } from "@/components/bets/BetCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export default function Bets() {
  useEffect(() => { document.title = "Apostas · Bankroll Pro"; }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: bets = [], isLoading } = useBets();
  const { data: profile } = useProfile();
  const updateBet = useUpdateBet();
  const deleteBet = useDeleteBet();
  const bulkUpdateBets = useBulkUpdateBets();
  const currency = profile?.currency ?? "BRL";

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  async function handleBulkStatus(newStatus: BetStatus) {
    const updates = selectedIds.map(id => {
      const b = bets.find(x => x.id === id);
      if (!b) return null;
      const stake = Number(b.stake_amount);
      const odds = Number(b.odds);
      return {
        id: b.id,
        bet_type: b.bet_type,
        patch: {
          status: newStatus,
          net_profit: computeNetProfit(newStatus, stake, odds),
          gross_return: computeGrossReturn(newStatus, stake, odds),
        }
      };
    }).filter(Boolean) as { id: string; bet_type: string; patch: Partial<BetInput> }[];

    if (updates.length > 0) {
      await bulkUpdateBets.mutateAsync(updates);
      toast.success(`${updates.length} apostas atualizadas para ${STATUS_LABELS[newStatus]}`);
      setSelectedIds([]);
    }
  }

  async function handleBulkDelete() {
    try {
      await Promise.all(selectedIds.map(id => deleteBet.mutateAsync(id)));
      toast.success(`${selectedIds.length} apostas excluídas`);
      setSelectedIds([]);
      setShowBulkDelete(false);
    } catch (e) {
      toast.error("Erro ao excluir apostas");
      console.error(e);
    }
  }

  // Filters from URL
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const sport = searchParams.get("sport") || "all";
  const bookmaker = searchParams.get("bookmaker") || "all";
  const betType = searchParams.get("type") || "all";
  const dateStart = searchParams.get("start") || "";
  const dateEnd = searchParams.get("end") || "";
  
  // Pagination from URL
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("size") || "20");

  const [toDelete, setToDelete] = useState<Bet | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all" || value === "") params.delete(key);
    else params.set(key, value);
    params.set("page", "1"); // Reset to first page on filter change
    setSearchParams(params);
    setSelectedIds([]); // Clear selection on filter change
  };

  const sports = useMemo(() => Array.from(new Set(bets.map((b) => b.sport).filter(Boolean) as string[])), [bets]);
  const books = useMemo(() => Array.from(new Set(bets.map((b) => b.bookmaker).filter(Boolean) as string[])), [bets]);

  const filtered = useMemo(() => {
    const lc = q.toLowerCase();
    return bets.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (sport !== "all" && b.sport !== sport) return false;
      if (bookmaker !== "all" && b.bookmaker !== bookmaker) return false;
      if (betType !== "all" && b.bet_type !== betType) return false;
      if (dateStart && new Date(b.bet_date) < new Date(dateStart)) return false;
      if (dateEnd && new Date(b.bet_date) > new Date(dateEnd + "T23:59:59")) return false;
      if (!lc) return true;
      return [b.event_name, b.market, b.selection, b.league, b.tipster, b.bookmaker, b.sport].some((f) =>
        (f ?? "").toLowerCase().includes(lc),
      );
    });
  }, [bets, q, status, sport, bookmaker, betType, dateStart, dateEnd]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const totals = useMemo(() => {
    const stake = filtered.reduce((s, b) => s + Number(b.stake_amount || 0), 0);
    const profit = filtered.reduce((s, b) => s + Number(b.net_profit || 0), 0);
    return { stake, profit, count: filtered.length };
  }, [filtered]);

  async function setStatusQuick(b: Bet, newStatus: BetStatus) {
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
          <Input value={q} onChange={(e) => updateParam("q", e.target.value)} placeholder="Buscar evento, mercado, seleção..." className="pl-8" />
        </div>
        <Select value={status} onValueChange={updateParam.bind(null, "status")}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sport} onValueChange={updateParam.bind(null, "sport")}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Esporte" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos esportes</SelectItem>
            {sports.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={bookmaker} onValueChange={updateParam.bind(null, "bookmaker")}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Casa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas casas</SelectItem>
            {books.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={betType} onValueChange={updateParam.bind(null, "type")}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="simples">Simples</SelectItem>
            <SelectItem value="multipla">Múltiplas</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" className="w-[140px]" value={dateStart} onChange={(e) => updateParam("start", e.target.value)} />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" className="w-[140px]" value={dateEnd} onChange={(e) => updateParam("end", e.target.value)} />
        </div>
        <Select value={String(pageSize)} onValueChange={(val) => updateParam("size", val)}>
          <SelectTrigger className="w-[110px]"><SelectValue placeholder="Itens/pág" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20 por pág.</SelectItem>
            <SelectItem value="50">50 por pág.</SelectItem>
            <SelectItem value="70">70 por pág.</SelectItem>
            <SelectItem value="100">100 por pág.</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totals.count}</span> apostas ·
          Stake <span className="font-mono">{formatCurrency(totals.stake, currency)}</span> ·
          Lucro <span className={`font-mono ${totals.profit > 0 ? "positive" : totals.profit < 0 ? "negative" : ""}`}>{formatCurrency(totals.profit, currency)}</span>
        </div>
      </div>

      {view === "cards" ? (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {isLoading && <div className="surface p-8 text-center text-muted-foreground md:col-span-2 xl:col-span-3">Carregando...</div>}
            {!isLoading && filtered.length === 0 && (
              <div className="surface p-8 text-center text-muted-foreground md:col-span-2 xl:col-span-3">Nenhuma aposta encontrada.</div>
            )}
            {isLoading ? null : paginated.map((b) => (
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
          {filtered.length > pageSize && (
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => {
                const p = new URLSearchParams(searchParams);
                p.set("page", String(page - 1));
                setSearchParams(p);
                setSelectedIds([]);
              }}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
              <span className="text-sm text-muted-foreground">Página {page} de {Math.ceil(filtered.length / pageSize)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(filtered.length / pageSize)} onClick={() => {
                const p = new URLSearchParams(searchParams);
                p.set("page", String(page + 1));
                setSearchParams(p);
                setSelectedIds([]);
              }}>Próximo <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          )}
        </div>
      ) : (
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  checked={paginated.length > 0 && paginated.every(b => selectedIds.includes(b.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const newSelected = [...selectedIds];
                      paginated.forEach(b => {
                        if (!newSelected.includes(b.id)) newSelected.push(b.id);
                      });
                      setSelectedIds(newSelected);
                    } else {
                      setSelectedIds(selectedIds.filter(id => !paginated.some(b => b.id === id)));
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
                />
              </TableHead>
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
            {isLoading && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Nenhuma aposta encontrada.</TableCell></TableRow>}
            {isLoading ? null : paginated.map((b) => (
              <TableRow key={b.id} className={selectedIds.includes(b.id) ? "bg-accent/20" : ""}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(b.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(prev => [...prev, b.id]);
                      } else {
                        setSelectedIds(prev => prev.filter(id => id !== b.id));
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(b.bet_date)}</TableCell>
                <TableCell>{b.sport || "—"}</TableCell>
                <TableCell>
                  {b.bet_type === "multipla" ? (
                    <div className="font-medium">Múltipla</div>
                  ) : (
                    <div className="font-medium">{b.event_name || "—"}</div>
                  )}
                  <div className="text-xs text-muted-foreground">{b.league || ""}</div>
                </TableCell>
                <TableCell>
                  {b.bet_type === "multipla" ? (
                    <div className="text-xs text-muted-foreground">Ver detalhes ao editar</div>
                  ) : (
                    <>
                      <div className="text-sm">{b.market || "—"}</div>
                      <div className="text-xs text-muted-foreground">{b.selection || ""}</div>
                    </>
                  )}
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
                      {b.bet_type === "multipla" ? (
                        <DropdownMenuItem asChild>
                          <Link to={`/apostas/${b.id}${window.location.search}`}><Pencil className="h-4 w-4 mr-2" />Editar pernas p/ atualizar status</Link>
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem onClick={() => setStatusQuick(b, "green")}><CheckCircle2 className="h-4 w-4 mr-2 text-success" />Marcar Ganha</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setStatusQuick(b, "red")}><XCircle className="h-4 w-4 mr-2 text-destructive" />Marcar Perdida</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setStatusQuick(b, "void")}><MinusCircle className="h-4 w-4 mr-2" />Marcar Anulada</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setStatusQuick(b, "pendente")}><RotateCcw className="h-4 w-4 mr-2" />Voltar a pendente</DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild><Link to={`/apostas/${b.id}${window.location.search}`}><Pencil className="h-4 w-4 mr-2" />Editar</Link></DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setToDelete(b)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > pageSize && (
          <div className="flex items-center justify-center gap-4 p-4 border-t">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set("page", String(page - 1));
              setSearchParams(p);
              setSelectedIds([]);
            }}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
            <span className="text-sm text-muted-foreground">Página {page} de {Math.ceil(filtered.length / pageSize)}</span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(filtered.length / pageSize)} onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set("page", String(page + 1));
              setSearchParams(p);
              setSelectedIds([]);
            }}>Próximo <ChevronRight className="h-4 w-4 ml-1" /></Button>
          </div>
        )}
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

      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.length} apostas?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação excluirá permanentemente todas as apostas selecionadas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-popover border border-border shadow-xl px-6 py-3 rounded-full flex items-center gap-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-xs font-semibold font-mono text-popover-foreground">
            {selectedIds.length} selecionada{selectedIds.length > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1 border-l border-border pl-4">
            <Button size="sm" variant="ghost" className="h-8 text-success hover:bg-success/15 hover:text-success" onClick={() => handleBulkStatus("green")}>
              Ganha
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-destructive/15 hover:text-destructive" onClick={() => handleBulkStatus("red")}>
              Perdida
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-muted" onClick={() => handleBulkStatus("void")}>
              Anulada
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:bg-muted" onClick={() => handleBulkStatus("pendente")}>
              Pendente
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-destructive/15 hover:text-destructive ml-2" onClick={() => setShowBulkDelete(true)}>
              Excluir
            </Button>
            <Button size="sm" variant="outline" className="h-8 rounded-full ml-2" onClick={() => setSelectedIds([])}>
              Limpar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}