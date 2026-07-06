import { useEffect, useState } from "react";
import { useBets, useCreateBet, useBulkCreateBets, type BetInput, type BetLegInput } from "@/hooks/useBets";
import { useTransactions } from "@/hooks/useTransactions";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Upload, FileText, AlertTriangle } from "lucide-react";
import { computeNetProfit, computeGrossReturn, computeMultipleOdds, computeMultipleStatus, type BetStatus, type LegStatus, STATUS_LABELS } from "@/lib/calc";
import { toast } from "sonner";

const HEADER = [
  "bet_date","event_date","sport","league","event_name","market","selection","bookmaker",
  "bet_type","timing","odds","closing_odds","stake_amount","status","estimated_probability","tipster","tags","notes","legs"
];

const TEMPLATE = HEADER.join(",") + "\n" +
  "2026-06-18 14:00,2026-06-18 16:00,Futebol,Brasileirão,Flamengo x Palmeiras,Resultado final,Flamengo,Bet365,simples,pre-live,2.10,1.95,100,green,55,Tipster X,value,Aposta de exemplo,\"[]\"";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join("|") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') inQ = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cols = parseLine(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = (cols[i] ?? "").trim());
    return obj;
  });
}

type Preview = {
  row: Record<string, string>;
  errors: string[];
  parsed?: BetInput;
  legsCount?: number;
};

function groupConsecutiveCsvMultiples(rows: Record<string, string>[]): any[] {
  const result: any[] = [];
  let currentGroup: {
    bet_date: string;
    stake_amount: string;
    event_date?: string;
    sport?: string;
    league?: string;
    event_name?: string;
    market?: string;
    selection?: string;
    bookmaker: string;
    bet_type: string;
    timing?: string;
    closing_odds?: string;
    estimated_probability?: string;
    tipster?: string;
    tags?: string;
    notes?: string;
    legs: any[];
  } | null = null;

  for (const row of rows) {
    const isMult = (row.bet_type || "").toLowerCase() === "multipla" || (row.bet_type || "").toLowerCase() === "múltipla";
    const hasLegsCol = !!row.legs;

    if (isMult && !hasLegsCol) {
      const date = row.bet_date;
      const stake = row.stake_amount;
      const book = row.bookmaker;

      if (
        currentGroup &&
        currentGroup.bet_date === date &&
        currentGroup.stake_amount === stake &&
        currentGroup.bookmaker === book
      ) {
        currentGroup.legs.push({
          sport: row.sport,
          league: row.league,
          event_name: row.event_name,
          event_date: row.event_date,
          market: row.market,
          selection: row.selection,
          odds: row.odds,
          status: row.status,
          tipster: row.tipster,
        });
      } else {
        currentGroup = {
          bet_date: date,
          stake_amount: stake,
          bookmaker: book,
          bet_type: "multipla",
          timing: row.timing,
          closing_odds: row.closing_odds,
          estimated_probability: row.estimated_probability,
          tipster: row.tipster,
          tags: row.tags,
          notes: row.notes,
          legs: [
            {
              sport: row.sport,
              league: row.league,
              event_name: row.event_name,
              event_date: row.event_date,
              market: row.market,
              selection: row.selection,
              odds: row.odds,
              status: row.status,
              tipster: row.tipster,
            }
          ],
        };
        result.push(currentGroup);
      }
    } else {
      currentGroup = null;
      result.push(row);
    }
  }
  return result;
}

function isDuplicate(parsed: BetInput, existingBets: any[]): boolean {
  return existingBets.some((b) => {
    if (b.bet_type !== parsed.bet_type) return false;
    if (b.bookmaker !== parsed.bookmaker) return false;
    if (Math.abs(Number(b.stake_amount) - Number(parsed.stake_amount)) > 0.01) return false;
    if (Math.abs(Number(b.odds) - Number(parsed.odds)) > 0.001) return false;
    
    const d1 = new Date(b.bet_date).getTime();
    const d2 = new Date(parsed.bet_date).getTime();
    if (Math.abs(d1 - d2) > 60000) return false; // Diferença menor que 1 minuto

    if (b.bet_type === "simples" && (b.event_name || "").trim().toLowerCase() !== (parsed.event_name || "").trim().toLowerCase()) return false;
    return true;
  });
}

export default function ImportExport() {
  useEffect(() => { document.title = "Importar / Exportar · Bankroll Pro"; }, []);
  const { data: bets = [] } = useBets();
  const { data: txs = [] } = useTransactions();
  const { data: profile } = useProfile();
  const createBet = useCreateBet();
  const bulkCreateBets = useBulkCreateBets();
  const [preview, setPreview] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);

  function validateBet(bet: any, existingBets: any[]): Preview {
    const errors: string[] = [];
    const isMultiple = (bet.bet_type || "").toLowerCase() === "multipla" || (bet.bet_type || "").toLowerCase() === "múltipla";
    const stake = parseFloat(bet.stake_amount);
    const date = bet.bet_date ? new Date(bet.bet_date) : null;
    const status = (bet.status || "pendente").toLowerCase() as BetStatus;

    if (!bet.bet_date) errors.push("data ausente");
    else if (!date || isNaN(date.getTime())) errors.push("data inválida");

    if (isNaN(stake) || stake <= 0) errors.push("stake inválida");
    if (!STATUS_LABELS[status]) errors.push("status desconhecido");

    let finalOdds = 0;
    let finalStatus = status;
    let parsedLegs: BetLegInput[] | undefined = undefined;

    if (isMultiple) {
      let legs: any[] = [];
      if (Array.isArray(bet.legs)) {
        legs = bet.legs;
      } else if (typeof bet.legs === "string" && bet.legs.trim()) {
        try {
          legs = JSON.parse(bet.legs);
        } catch (e) {
          errors.push("legs JSON inválido");
        }
      }

      if (legs.length < 2) {
        errors.push("múltipla precisa de pelo menos 2 pernas");
      }

      parsedLegs = legs.map((l: any, idx: number) => {
        const legOdds = parseFloat(l.odds);
        if (isNaN(legOdds) || legOdds <= 1) {
          errors.push(`perna ${idx + 1}: odd inválida`);
        }
        const legStatus = (l.status || "pendente").toLowerCase() as LegStatus;
        if (legStatus !== "pendente" && legStatus !== "green" && legStatus !== "red" && legStatus !== "void") {
          errors.push(`perna ${idx + 1}: status desconhecido (${l.status})`);
        }
        return {
          order_index: l.order_index ?? idx,
          sport: l.sport || null,
          league: l.league || null,
          event_name: l.event_name || null,
          home_team: l.home_team || null,
          away_team: l.away_team || null,
          event_date: l.event_date ? new Date(l.event_date).toISOString() : null,
          market: l.market || null,
          selection: l.selection || null,
          odds: legOdds,
          status: legStatus,
          tipster: l.tipster || null,
        };
      });

      finalOdds = computeMultipleOdds(parsedLegs);
      finalStatus = computeMultipleStatus(parsedLegs);
    } else {
      const singleOdds = parseFloat(bet.odds);
      if (isNaN(singleOdds) || singleOdds <= 1) {
        errors.push("odd inválida");
      } else {
        finalOdds = singleOdds;
      }
    }

    const closing = bet.closing_odds ? parseFloat(bet.closing_odds) : NaN;
    if (bet.closing_odds && (isNaN(closing) || closing <= 1)) {
      errors.push("closing odd inválida");
    }

    const rowDisplay = {
      bet_date: bet.bet_date || "",
      event_name: isMultiple ? `Múltipla (${parsedLegs?.length || 0} pernas)` : (bet.event_name || "—"),
      odds: String(finalOdds ? finalOdds.toFixed(3) : bet.odds || ""),
      stake_amount: String(bet.stake_amount || ""),
      status: finalStatus,
    };

    if (errors.length === 0) {
      const tempParsed: BetInput = {
        bet_date: date!.toISOString(),
        odds: finalOdds,
        stake_amount: stake,
        bookmaker: bet.bookmaker || null,
        bet_type: isMultiple ? "multipla" : "simples",
        event_name: isMultiple ? `Múltipla (${parsedLegs?.length || 0} pernas)` : (bet.event_name || null),
        status: finalStatus,
      };
      if (isDuplicate(tempParsed, existingBets)) {
        errors.push("já importada (duplicada)");
      }
    }

    if (errors.length) {
      return { row: rowDisplay, errors };
    }

    const net = computeNetProfit(finalStatus, stake, finalOdds);
    const gross = computeGrossReturn(finalStatus, stake, finalOdds);

    const parsed: BetInput = {
      bet_date: date!.toISOString(),
      event_date: bet.event_date ? new Date(bet.event_date).toISOString() : null,
      sport: bet.sport || null,
      league: bet.league || null,
      event_name: isMultiple ? `Múltipla (${parsedLegs?.length || 0} pernas)` : (bet.event_name || null),
      market: bet.market || null,
      selection: bet.selection || null,
      bookmaker: bet.bookmaker || null,
      bet_type: isMultiple ? "multipla" : "simples",
      timing: bet.timing || "pre-live",
      odds: finalOdds,
      closing_odds: !isNaN(closing) ? closing : null,
      stake_amount: stake,
      status: finalStatus,
      gross_return: gross,
      net_profit: net,
      estimated_probability: bet.estimated_probability ? parseFloat(bet.estimated_probability) : null,
      implied_probability: (1 / finalOdds) * 100,
      tipster: bet.tipster || null,
      tags: Array.isArray(bet.tags)
        ? bet.tags
        : bet.tags
          ? String(bet.tags).split(/[|,]/).map((t: string) => t.trim()).filter(Boolean)
          : [],
      notes: bet.notes || null,
      legs: parsedLegs || [],
    };

    return {
      row: rowDisplay,
      errors: [],
      parsed,
      legsCount: parsedLegs?.length,
    };
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isJson = file.name.endsWith(".json");
    file.text().then((txt) => {
      try {
        if (isJson) {
          const data = JSON.parse(txt);
          if (!Array.isArray(data)) {
            toast.error("O arquivo JSON deve conter uma lista de apostas.");
            return;
          }
          setPreview(data.map((b: any) => validateBet(b, bets)));
        } else {
          const rows = parseCsv(txt);
          const grouped = groupConsecutiveCsvMultiples(rows);
          setPreview(grouped.map((b: any) => validateBet(b, bets)));
        }
      } catch (err) {
        toast.error("Erro ao processar o arquivo. Verifique o formato.");
        console.error(err);
      }
    });
    e.target.value = "";
  }

  async function confirmImport() {
    const valid = preview.filter((p) => p.errors.length === 0 && p.parsed).map(p => p.parsed!);
    if (!valid.length) { toast.error("Nenhuma linha válida para importar."); return; }
    setBusy(true);
    try {
      // Importar em lotes de 200 para evitar limites do PostgREST
      const CHUNK_SIZE = 200;
      let count = 0;
      for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
        const chunk = valid.slice(i, i + CHUNK_SIZE);
        count += await bulkCreateBets.mutateAsync(chunk);
      }
      toast.success(`${count} apostas importadas.`);
      setPreview([]);
    } catch (e) {
      toast.error("Erro ao importar apostas. Verifique o console.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }


  const errors = preview.filter((p) => p.errors.length > 0).length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar / Exportar</h1>
        <p className="text-sm text-muted-foreground">Mova suas apostas para dentro e para fora do Bankroll Pro via CSV.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="surface p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold"><Upload className="h-4 w-4" />Importar apostas</div>
          <p className="text-sm text-muted-foreground">
            Carregue um arquivo CSV com as colunas abaixo. Valide a prévia antes de salvar.
          </p>
          <div className="text-xs text-muted-foreground border border-border rounded p-2 font-mono break-all">
            {HEADER.join(", ")}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="inline-flex">
              <input type="file" accept=".csv, .json" onChange={onFile} className="hidden" />
              <Button asChild className="w-full sm:w-auto"><span><Upload className="h-4 w-4 mr-2" />Escolher arquivo</span></Button>
            </label>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => download("modelo-bankroll-pro.csv", TEMPLATE)}>
              <FileText className="h-4 w-4 mr-2" />Baixar modelo
            </Button>
          </div>
        </div>

        <div className="surface p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4" />Exportar</div>
          <p className="text-sm text-muted-foreground">Baixe seus dados em CSV.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => download(`apostas-${Date.now()}.csv`, toCsv(bets))} disabled={bets.length === 0}>
              Apostas ({bets.length})
            </Button>
            <Button variant="outline" onClick={() => download(`transacoes-${Date.now()}.csv`, toCsv(txs))} disabled={txs.length === 0}>
              Transações ({txs.length})
            </Button>
            <Button variant="outline" onClick={() => {
              const m = new Map<string, { stake: number; lucro: number; count: number }>();
              for (const b of bets) {
                const d = new Date(b.bet_date);
                const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                const cur = m.get(k) ?? { stake: 0, lucro: 0, count: 0 };
                cur.stake += Number(b.stake_amount || 0);
                cur.lucro += Number(b.net_profit || 0);
                cur.count++;
                m.set(k, cur);
              }
              const rows = Array.from(m.entries()).sort().map(([mes, v]) => ({ mes, apostas: v.count, stake: v.stake, lucro: v.lucro, roi: v.stake ? (v.lucro / v.stake) * 100 : 0 }));
              download(`relatorio-mensal-${Date.now()}.csv`, toCsv(rows));
            }} disabled={bets.length === 0}>
              Relatório mensal
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Moeda: {profile?.currency ?? "BRL"}</p>
        </div>


      </div>

      {preview.length > 0 && (
        <div className="surface">
          <div className="p-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-semibold">{preview.length}</span> linhas ·
              <span className="text-success font-semibold ml-1">{preview.length - errors} ok</span>
              {errors > 0 && <span className="text-destructive font-semibold ml-1 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors} com erro</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview([])}>Cancelar</Button>
              <Button onClick={confirmImport} disabled={busy || preview.length - errors === 0}>
                {busy ? "Importando..." : `Importar ${preview.length - errors} apostas`}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Odd</TableHead>
                  <TableHead>Stake</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((p, i) => (
                  <TableRow key={i} className={p.errors.length ? "bg-destructive/5" : ""}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs">{p.row.bet_date}</TableCell>
                    <TableCell className="text-sm">{p.row.event_name}</TableCell>
                    <TableCell className="font-mono">{p.row.odds}</TableCell>
                    <TableCell className="font-mono">{p.row.stake_amount}</TableCell>
                    <TableCell>{p.row.status}</TableCell>
                    <TableCell className="text-xs text-destructive">{p.errors.join("; ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}