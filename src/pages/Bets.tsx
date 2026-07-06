import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { DUR } from "@/lib/motion";
import { StatusBadgePop } from "@/components/bets/StatusBadgePop";
import { useBets, useDeleteBet, useUpdateBet, useBulkUpdateBets, type Bet, type BetInput } from "@/hooks/useBets";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal, PlusCircle, Search, Pencil, Trash2, CheckCircle2, XCircle, MinusCircle, RotateCcw, LayoutGrid, List, Rows3, ChevronLeft, ChevronRight, Layers, SlidersHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_COLORS, STATUS_LABELS, computeNetProfit, computeGrossReturn, type BetStatus } from "@/lib/calc";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { BookmakerLogo } from "@/components/bookmakers/BookmakerLogo";
import { BetCard } from "@/components/bets/BetCard";
import { BetsPagination } from "@/components/bets/BetsPagination";
import { legFromBet } from "@/components/bets/LegsEditor";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

const ODDS_BUCKETS: { value: string; label: string; test: (odds: number) => boolean }[] = [
  { value: "lt15", label: "< 1.50", test: (o) => o < 1.5 },
  { value: "15-2", label: "1.50 – 2.00", test: (o) => o >= 1.5 && o < 2 },
  { value: "2-3", label: "2.00 – 3.00", test: (o) => o >= 2 && o < 3 },
  { value: "3-5", label: "3.00 – 5.00", test: (o) => o >= 3 && o < 5 },
  { value: "gte5", label: "≥ 5.00", test: (o) => o >= 5 },
];

export default function Bets() {
  useEffect(() => { document.title = "Apostas · Bankroll Pro"; }, []);
  const nav = useNavigate();
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
          // is_free_bet: perder freebet não custa nada (SNR) — sem isso o lote calculava -stake.
          net_profit: computeNetProfit(newStatus, stake, odds, null, b.is_free_bet),
          gross_return: computeGrossReturn(newStatus, stake, odds, null, b.is_free_bet),
        }
      };
    }).filter(Boolean) as { id: string; bet_type: string; patch: Partial<BetInput> }[];

    if (updates.length > 0) {
      await bulkUpdateBets.mutateAsync(updates);
      toast.success(`${updates.length} apostas atualizadas para ${STATUS_LABELS[newStatus]}`);
      setSelectedIds([]);
    }
  }

  const selectedSimpleBets = useMemo(
    () => selectedIds
      .map((id) => bets.find((b) => b.id === id))
      .filter((b): b is Bet => !!b && b.bet_type !== "multipla"),
    [selectedIds, bets],
  );
  const canCombineIntoMultiple = selectedSimpleBets.length >= 2 && selectedSimpleBets.length === selectedIds.length;

  function handleCombineIntoMultiple() {
    const legs = selectedSimpleBets.map((b) => legFromBet(b));
    nav("/nova-aposta", { state: { legsFromBets: legs } });
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

  // Filters padrão (sempre visíveis) — from URL
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const sport = searchParams.get("sport") || "all";
  const bookmaker = searchParams.get("bookmaker") || "all";

  // Filters avançados (atrás do botão "+") — from URL
  const betType = searchParams.get("type") || "all";
  const dateStart = searchParams.get("start") || "";
  const dateEnd = searchParams.get("end") || "";
  const tipster = searchParams.get("tipster") || "all";
  const sort = searchParams.get("sort") || "desc"; // desc = mais recentes primeiro
  const oddsBucket = searchParams.get("odds") || "all";
  const stakeMin = searchParams.get("stakeMin") || "";
  const stakeMax = searchParams.get("stakeMax") || "";

  const advancedActive = betType !== "all" || !!dateStart || !!dateEnd || tipster !== "all" || sort !== "desc" || oddsBucket !== "all" || !!stakeMin || !!stakeMax;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Pagination from URL
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("size") || "20");

  const [toDelete, setToDelete] = useState<Bet | null>(null);
  // Vista persistida — usuário intensivo escolhe compacto uma vez e fica.
  type ViewMode = "cards" | "compact" | "table";
  const [view, setViewState] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("bets:view");
    return saved === "compact" || saved === "table" ? saved : "cards";
  });
  const setView = (v: ViewMode) => {
    setViewState(v);
    localStorage.setItem("bets:view", v);
  };

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all" || value === "") params.delete(key);
    else params.set(key, value);
    params.set("page", "1"); // Reset to first page on filter change
    setSearchParams(params);
    setSelectedIds([]); // Clear selection on filter change
  };

  const handleClearFilters = () => {
    setSearchParams({}); // Isso remove todos os parâmetros da URL de uma vez
    setSelectedIds([]);  // Limpa as seleções da tabela
  };

  // Filtros rápidos de data (mesmo padrão do #18 nas Análises). Data em fuso
  // local — toISOString viraria o dia errado perto da meia-noite.
  const localISO = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const QUICK_RANGES = [
    { label: "Hoje", days: 0 },
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "Tudo", days: null },
  ] as const;
  const applyQuickRange = (days: number | null) => {
    const params = new URLSearchParams(searchParams);
    if (days == null) {
      params.delete("start");
      params.delete("end");
    } else {
      params.set("start", localISO(days));
      params.delete("end");
    }
    params.set("page", "1");
    setSearchParams(params);
    setSelectedIds([]);
  };
  const quickActive = (days: number | null) =>
    days == null ? !dateStart && !dateEnd : dateStart === localISO(days) && !dateEnd;

  const sports = useMemo(() => Array.from(new Set(bets.map((b) => b.sport).filter(Boolean) as string[])), [bets]);
  const books = useMemo(() => Array.from(new Set(bets.map((b) => b.bookmaker).filter(Boolean) as string[])), [bets]);
  const tipsters = useMemo(() => Array.from(new Set(bets.map((b) => b.tipster).filter(Boolean) as string[])), [bets]);

  const filtered = useMemo(() => {
    const lc = q.toLowerCase();
    const min = stakeMin ? Number(stakeMin) : null;
    const max = stakeMax ? Number(stakeMax) : null;
    const bucket = ODDS_BUCKETS.find((b) => b.value === oddsBucket);
    return bets.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (sport !== "all" && b.sport !== sport) return false;
      if (bookmaker !== "all" && b.bookmaker !== bookmaker) return false;
      if (betType !== "all" && b.bet_type !== betType) return false;
      if (tipster !== "all" && b.tipster !== tipster) return false;
      if (dateStart && new Date(b.bet_date) < new Date(dateStart)) return false;
      if (dateEnd && new Date(b.bet_date) > new Date(dateEnd + "T23:59:59")) return false;
      if (bucket && !bucket.test(Number(b.odds))) return false;
      if (min != null && !Number.isNaN(min) && Number(b.stake_amount) < min) return false;
      if (max != null && !Number.isNaN(max) && Number(b.stake_amount) > max) return false;
      if (!lc) return true;
      return [b.event_name, b.market, b.selection, b.league, b.tipster, b.bookmaker, b.sport].some((f) =>
        (f ?? "").toLowerCase().includes(lc),
      );
    });
  }, [bets, q, status, sport, bookmaker, betType, tipster, dateStart, dateEnd, oddsBucket, stakeMin, stakeMax]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const da = new Date(a.bet_date).getTime();
      const db = new Date(b.bet_date).getTime();
      return sort === "asc" ? da - db : db - da;
    });
    return arr;
  }, [filtered, sort]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  function goToPage(n: number) {
    const target = Math.min(Math.max(1, n), totalPages);
    const p = new URLSearchParams(searchParams);
    p.set("page", String(target));
    setSearchParams(p);
    setSelectedIds([]);
  }

  async function setStatusQuick(b: Bet, newStatus: BetStatus) {
    const stake = Number(b.stake_amount);
    const odds = Number(b.odds);
    await updateBet.mutateAsync({
      id: b.id,
      patch: {
        status: newStatus,
        // is_free_bet: mesmo fix do handleBulkStatus — freebet perdida não custa stake.
        net_profit: computeNetProfit(newStatus, stake, odds, null, b.is_free_bet),
        gross_return: computeGrossReturn(newStatus, stake, odds, null, b.is_free_bet),
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
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as ViewMode)} variant="outline" size="sm">
            <ToggleGroupItem value="cards" aria-label="Cards"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="compact" aria-label="Compacto"><List className="h-4 w-4" /></ToggleGroupItem>
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
        <div className="flex items-center gap-1">
          {QUICK_RANGES.map((r) => (
            <Button
              key={r.label}
              type="button"
              size="sm"
              variant={quickActive(r.days) ? "default" : "outline"}
              className="h-8 px-2.5"
              onClick={() => applyQuickRange(r.days)}
            >
              {r.label}
            </Button>
          ))}
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

        <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <PopoverTrigger asChild>
            <Button variant={advancedActive ? "default" : "outline"} size="sm" className="relative">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Avançado
              {advancedActive && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[320px] space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipster</Label>
              <Select value={tipster} onValueChange={updateParam.bind(null, "tipster")}>
                <SelectTrigger><SelectValue placeholder="Tipster" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos tipsters</SelectItem>
                  {tipsters.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={betType} onValueChange={updateParam.bind(null, "type")}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos tipos</SelectItem>
                  <SelectItem value="simples">Simples</SelectItem>
                  <SelectItem value="multipla">Múltiplas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ordenar por data</Label>
              <Select value={sort} onValueChange={updateParam.bind(null, "sort")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Mais recentes primeiro</SelectItem>
                  <SelectItem value="asc">Mais antigas primeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Faixa de odds</Label>
              <Select value={oddsBucket} onValueChange={updateParam.bind(null, "odds")}>
                <SelectTrigger><SelectValue placeholder="Todas odds" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas odds</SelectItem>
                  {ODDS_BUCKETS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Faixa de stake</Label>
              <div className="flex items-center gap-2">
                <Input type="number" inputMode="decimal" placeholder="Mín." value={stakeMin} onChange={(e) => updateParam("stakeMin", e.target.value)} />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="number" inputMode="decimal" placeholder="Máx." value={stakeMax} onChange={(e) => updateParam("stakeMax", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Período</Label>
              {/* min-w-0 + flex-1: input date tem largura intrínseca e vazava do popover. */}
              <div className="flex items-center gap-2">
                <Input type="date" className="flex-1 min-w-0" value={dateStart} onChange={(e) => updateParam("start", e.target.value)} />
                <span className="text-xs text-muted-foreground shrink-0">até</span>
                <Input type="date" className="flex-1 min-w-0" value={dateEnd} onChange={(e) => updateParam("end", e.target.value)} />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Select value={String(pageSize)} onValueChange={(val) => updateParam("size", val)}>
          <SelectTrigger className="w-[110px]"><SelectValue placeholder="Itens/pág" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20 por pág.</SelectItem>
            <SelectItem value="50">50 por pág.</SelectItem>
            <SelectItem value="70">70 por pág.</SelectItem>
            <SelectItem value="100">100 por pág.</SelectItem>
          </SelectContent>
        </Select>
          {(q || status !== "all" || sport !== "all" || bookmaker !== "all" || advancedActive) && (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClearFilters}
      className="text-muted-foreground hover:text-destructive transition-colors"
    >
      <RotateCcw className="h-4 w-4 mr-2" />
      Limpar Filtros
    </Button>
  )}
      </div>

      {view !== "table" ? (
        <div className="space-y-6">
          {/* grid-cols-1 explícito: a coluna implícita usa piso min-content e as
              linhas nowrap (truncate) dos cards estouravam a tela no mobile. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DUR.state }} className={view === "compact" ? "grid gap-2 grid-cols-1" : "grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="surface p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              ))}
            {!isLoading && filtered.length === 0 && (
              <div className="surface p-8 text-center text-muted-foreground md:col-span-2 xl:col-span-3">Nenhuma aposta encontrada.</div>
            )}
            {isLoading ? null : paginated.map((b) => (
              <div key={b.id}>
                <BetCard
                  compact={view === "compact"}
                  bet={b}
                  currency={currency}
                  unitValue={profile?.unit_value}
                  onStatus={setStatusQuick}
                  onDelete={setToDelete}
                />
              </div>
            ))}
          </motion.div>
          <BetsPagination page={page} totalPages={totalPages} onGoTo={goToPage} />
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
                    <div className="text-xs text-muted-foreground">Múltipla · pernas em Editar</div>
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
                  <StatusBadgePop status={b.status}>
                    <Badge variant="outline" className={STATUS_COLORS[b.status]}>{STATUS_LABELS[b.status]}</Badge>
                  </StatusBadgePop>
                </TableCell>
                {/* whitespace-nowrap: o navegador quebra linha após o "-" de valores negativos. */}
                <TableCell className={`text-right font-mono whitespace-nowrap ${Number(b.net_profit) > 0 ? "positive" : Number(b.net_profit) < 0 ? "negative" : ""}`}>
                  {b.status !== "pendente" && b.net_profit != null ? formatCurrency(Number(b.net_profit), currency) : "—"}
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
        <BetsPagination page={page} totalPages={totalPages} onGoTo={goToPage} className="p-4 border-t" />
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
            {canCombineIntoMultiple && (
              <Button size="sm" variant="ghost" className="h-8 text-primary hover:bg-primary/15 hover:text-primary" onClick={handleCombineIntoMultiple}>
                <Layers className="h-4 w-4 mr-1.5" />
                Combinar em múltipla
              </Button>
            )}
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
