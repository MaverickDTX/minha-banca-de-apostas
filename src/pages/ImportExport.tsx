import { useEffect, useState } from "react";
import { useBets, useCreateBet, type BetInput } from "@/hooks/useBets";
import { useTransactions } from "@/hooks/useTransactions";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Upload, FileText, AlertTriangle } from "lucide-react";
import { computeNetProfit, computeGrossReturn, type BetStatus, STATUS_LABELS } from "@/lib/calc";
import { toast } from "sonner";

const HEADER = [
  "bet_date","event_date","sport","league","event_name","market","selection","bookmaker",
  "bet_type","timing","odds","closing_odds","stake_amount","status","estimated_probability","tipster","tags","notes",
];

const TEMPLATE = HEADER.join(",") + "\n" +
  "2026-06-18 14:00,2026-06-18 16:00,Futebol,Brasileirão,Flamengo x Palmeiras,Resultado final,Flamengo,Bet365,simples,pre-live,2.10,1.95,100,green,55,Tipster X,value,Aposta de exemplo";

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

type Preview = { row: Record<string, string>; errors: string[]; parsed?: BetInput };

export default function ImportExport() {
  useEffect(() => { document.title = "Importar / Exportar · Bankroll Pro"; }, []);
  const { data: bets = [] } = useBets();
  const { data: txs = [] } = useTransactions();
  const { data: profile } = useProfile();
  const createBet = useCreateBet();
  const [preview, setPreview] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);

  function validateRow(r: Record<string, string>): Preview {
    const errors: string[] = [];
    const odds = parseFloat(r.odds);
    const stake = parseFloat(r.stake_amount);
    const closing = r.closing_odds ? parseFloat(r.closing_odds) : NaN;
    const status = (r.status || "pendente").toLowerCase() as BetStatus;
    if (!r.bet_date) errors.push("data ausente");
    if (!odds || odds <= 1) errors.push("odd inválida");
    if (!stake || stake <= 0) errors.push("stake inválida");
    if (r.closing_odds && (isNaN(closing) || closing <= 1)) errors.push("closing odd inválida");
    if (!STATUS_LABELS[status]) errors.push("status desconhecido");
    const date = new Date(r.bet_date);
    if (isNaN(date.getTime())) errors.push("data inválida");

    if (errors.length) return { row: r, errors };

    const net = computeNetProfit(status, stake, odds);
    const gross = computeGrossReturn(status, stake, odds);
    const parsed: BetInput = {
      bet_date: date.toISOString(),
      event_date: r.event_date ? new Date(r.event_date).toISOString() : null,
      sport: r.sport || null,
      league: r.league || null,
      event_name: r.event_name || null,
      market: r.market || null,
      selection: r.selection || null,
      bookmaker: r.bookmaker || null,
      bet_type: r.bet_type || "simples",
      timing: r.timing || "pre-live",
      odds, closing_odds: r.closing_odds ? closing : null,
      stake_amount: stake,
      status,
      gross_return: gross,
      net_profit: net,
      estimated_probability: r.estimated_probability ? parseFloat(r.estimated_probability) : null,
      implied_probability: (1 / odds) * 100,
      tipster: r.tipster || null,
      tags: r.tags ? r.tags.split(/[|,]/).map((t) => t.trim()).filter(Boolean) : [],
      notes: r.notes || null,
    };
    return { row: r, errors: [], parsed };
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      const rows = parseCsv(txt);
      setPreview(rows.map(validateRow));
    });
    e.target.value = "";
  }

  async function confirmImport() {
    const valid = preview.filter((p) => p.errors.length === 0 && p.parsed);
    if (!valid.length) { toast.error("Nenhuma linha válida para importar."); return; }
    setBusy(true);
    for (const p of valid) {
      await createBet.mutateAsync(p.parsed!);
    }
    setBusy(false);
    toast.success(`${valid.length} apostas importadas.`);
    setPreview([]);
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
          <div className="flex gap-2">
            <label className="inline-flex">
              <input type="file" accept=".csv" onChange={onFile} className="hidden" />
              <Button asChild><span><Upload className="h-4 w-4 mr-2" />Escolher CSV</span></Button>
            </label>
            <Button variant="outline" onClick={() => download("modelo-bankroll-pro.csv", TEMPLATE)}>
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