import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle2,
  ExternalLink,
  MinusCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { BookmakerLogo } from "@/components/bookmakers/BookmakerLogo";
import { STATUS_COLORS, STATUS_LABELS, type BetStatus } from "@/lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "@/lib/format";
import type { Bet } from "@/hooks/useBets";
import { cn } from "@/lib/utils";

const STATUS_ACCENT: Record<BetStatus, string> = {
  pendente: "before:bg-muted-foreground/40",
  green: "before:bg-success",
  red: "before:bg-destructive",
  void: "before:bg-muted-foreground/30",
  half_green: "before:bg-success/70",
  half_red: "before:bg-destructive/70",
  cashout: "before:bg-accent",
};

const TIMING_LABEL: Record<string, string> = { "pre-live": "Pré-live", live: "Live" };
const TYPE_LABEL: Record<string, string> = { simples: "Simples", multipla: "Múltipla", sistema: "Sistema" };

export function BetCard({
  bet,
  currency,
  unitValue,
  onStatus,
  onDelete,
}: {
  bet: Bet;
  currency: string;
  unitValue?: number;
  onStatus: (b: Bet, s: BetStatus) => void;
  onDelete: (b: Bet) => void;
}) {
  const units =
    bet.stake_units ??
    (unitValue && unitValue > 0 ? Number(bet.stake_amount) / unitValue : null);
  const net = bet.net_profit != null ? Number(bet.net_profit) : null;

  return (
    <div
      className={cn(
        "surface relative pl-4 pr-3 py-3 flex flex-col gap-2 transition hover:border-foreground/20",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-lg",
        STATUS_ACCENT[bet.status],
      )}
    >
      <div className="flex items-start gap-3">
        <BookmakerLogo name={bet.bookmaker ?? "—"} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{bet.bookmaker || "Sem casa"}</span>
            <Badge variant="outline" className={cn("text-[10px] uppercase", STATUS_COLORS[bet.status])}>
              {STATUS_LABELS[bet.status]}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
            {bet.sport && <span>{bet.sport}</span>}
            {bet.league && <span>· {bet.league}</span>}
            <span>· {TYPE_LABEL[bet.bet_type] ?? bet.bet_type}</span>
            <span>· {TIMING_LABEL[bet.timing] ?? bet.timing}</span>
            <span>· {formatDate(bet.bet_date)}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 -mt-1 -mr-1">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onStatus(bet, "green")}>
              <CheckCircle2 className="h-4 w-4 mr-2 text-success" />Marcar Ganha
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus(bet, "red")}>
              <XCircle className="h-4 w-4 mr-2 text-destructive" />Marcar Perdida
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus(bet, "half_green")}>
              <CheckCircle2 className="h-4 w-4 mr-2 opacity-70" />Meio Ganha
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus(bet, "half_red")}>
              <XCircle className="h-4 w-4 mr-2 opacity-70" />Meio Perdida
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus(bet, "void")}>
              <MinusCircle className="h-4 w-4 mr-2" />Anulada
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatus(bet, "pendente")}>
              <RotateCcw className="h-4 w-4 mr-2" />Voltar a pendente
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/apostas/${bet.id}`}>
                <Pencil className="h-4 w-4 mr-2" />Editar
              </Link>
            </DropdownMenuItem>
            {bet.external_link && (
              <DropdownMenuItem asChild>
                <a href={bet.external_link} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />Abrir link
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onDelete(bet)} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="pl-[52px] -mt-1">
        <div className="font-medium leading-tight truncate">{bet.event_name || "—"}</div>
        <div className="text-xs text-muted-foreground truncate">
          {bet.market || "—"}
          {bet.selection ? <span className="text-foreground/80"> — {bet.selection}</span> : null}
        </div>
      </div>

      <div className="pl-[52px] grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 text-xs">
        <Metric label="Odd" value={formatNumber(Number(bet.odds), 2)} mono />
        <Metric
          label="Stake"
          value={
            <>
              {formatCurrency(Number(bet.stake_amount), currency)}
              {units != null && (
                <span className="text-muted-foreground"> · {formatNumber(units, 2)}u</span>
              )}
            </>
          }
          mono
        />
        {bet.closing_odds != null && (
          <Metric label="Fech." value={formatNumber(Number(bet.closing_odds), 2)} mono />
        )}
        {bet.clv != null && (
          <Metric
            label="CLV"
            value={formatPercent(Number(bet.clv))}
            tone={Number(bet.clv) > 0 ? "positive" : Number(bet.clv) < 0 ? "negative" : undefined}
            mono
          />
        )}
        {bet.ev != null && (
          <Metric
            label="EV"
            value={formatCurrency(Number(bet.ev), currency)}
            tone={Number(bet.ev) > 0 ? "positive" : Number(bet.ev) < 0 ? "negative" : undefined}
            mono
          />
        )}
        {bet.edge != null && (
          <Metric
            label="Edge"
            value={formatPercent(Number(bet.edge))}
            tone={Number(bet.edge) > 0 ? "positive" : "negative"}
            mono
          />
        )}
      </div>

      <div className="pl-[52px] flex items-center justify-between border-t border-border/60 pt-2 mt-1">
        <span className="text-xs text-muted-foreground">Lucro líquido</span>
        <span
          className={cn(
            "font-mono font-semibold tabular-nums",
            net != null && net > 0 && "positive",
            net != null && net < 0 && "negative",
          )}
        >
          {net != null ? formatCurrency(net, currency) : "—"}
        </span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "positive" | "negative";
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          mono && "font-mono tabular-nums",
          tone === "positive" && "positive",
          tone === "negative" && "negative",
        )}
      >
        {value}
      </span>
    </div>
  );
}