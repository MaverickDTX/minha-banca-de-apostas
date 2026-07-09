import { useState } from "react";
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
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MinusCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { BookmakerLogo } from "@/components/bookmakers/BookmakerLogo";
import { STATUS_COLORS, STATUS_LABELS, type BetStatus, type LegStatus } from "@/lib/calc";
import { formatCurrency, formatDate, formatNumber, formatPercent, formatTime } from "@/lib/format";
import { useBetLegs, type Bet } from "@/hooks/useBets";
import { StatusBadgePop } from "@/components/bets/StatusBadgePop";
import { cn } from "@/lib/utils";

const LEG_STATUS_COLORS: Record<LegStatus, string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  green: "bg-success/15 text-success border-success/30",
  red: "bg-destructive/15 text-destructive border-destructive/30",
  void: "bg-warning/15 text-warning border-warning/30",
};
const LEG_STATUS_LABELS: Record<LegStatus, string> = {
  pendente: "Pendente",
  green: "Ganha",
  red: "Perdida",
  void: "Anulada",
};

const STATUS_ACCENT: Record<BetStatus, string> = {
  pendente: "before:bg-muted-foreground/40",
  green: "before:bg-success",
  red: "before:bg-destructive",
  void: "before:bg-warning/50",
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
  compact = false,
}: {
  bet: Bet;
  currency: string;
  unitValue?: number;
  onStatus: (b: Bet, s: BetStatus) => void;
  onDelete: (b: Bet) => void;
  /** Layout de 1 linha p/ usuário intensivo — mais apostas por tela. */
  compact?: boolean;
}) {
  const units =
    bet.stake_units ??
    (unitValue && unitValue > 0 ? Number(bet.stake_amount) / unitValue : null);
  // Pendente não tem resultado — exibir "—" em vez de R$ 0,00 (zero = break-even).
  const net = bet.status !== "pendente" && bet.net_profit != null ? Number(bet.net_profit) : null;
  const isMultiple = bet.bet_type === "multipla";
  // Data da aposta + horário do evento quando disponível (ex.: "11/07 · 20:30").
  const eventTime = formatTime(bet.event_date);
  const dateLabel = eventTime ? `${formatDate(bet.bet_date)} · ${eventTime}` : formatDate(bet.bet_date);
  const [expanded, setExpanded] = useState(false);
  const { data: legs = [] } = useBetLegs(isMultiple ? bet.id : undefined);

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 -mt-1 -mr-1">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isMultiple ? (
          <DropdownMenuItem asChild>
            <Link to={`/apostas/${bet.id}${window.location.search}`}>
              <Pencil className="h-4 w-4 mr-2" />Editar pernas p/ atualizar status
            </Link>
          </DropdownMenuItem>
        ) : (
          <>
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
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/apostas/${bet.id}${window.location.search}`}>
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
  );

  // Quick actions no hover (desktop). Overlay ABSOLUTO: com opacity-0 no fluxo
  // os botões reservavam ~100px e quebravam a linha de metadados dos cards.
  const quickActions = (positionCls: string) => (
    <div
      className={cn(
        // Barra flutuante estilo Gmail: pode cobrir conteúdo no hover, mas com
        // borda+sombra p/ ler como toolbar intencional, não como defeito.
        "absolute z-10 hidden md:flex items-center gap-0.5 rounded-lg bg-card border border-border shadow-lg px-1 py-0.5",
        "opacity-0 pointer-events-none transition-opacity",
        "group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto",
        positionCls,
      )}
    >
      {!isMultiple && bet.status === "pendente" && (
        <>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:text-success" aria-label="Marcar Ganha" title="Marcar Ganha" onClick={() => onStatus(bet, "green")}>
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Marcar Perdida" title="Marcar Perdida" onClick={() => onStatus(bet, "red")}>
            <XCircle className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
        <Link to={`/apostas/${bet.id}${window.location.search}`} aria-label="Editar" title="Editar"><Pencil className="h-4 w-4" /></Link>
      </Button>
    </div>
  );

  if (compact) {
    const clv = bet.clv != null ? Number(bet.clv) : null;
    return (
      <div
        className={cn(
          "surface group relative pl-3 pr-2 py-2 flex items-center gap-3 motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.02] motion-safe:hover:shadow-xl h-full",
          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-lg",
          STATUS_ACCENT[bet.status],
        )}
      >
        <BookmakerLogo name={bet.bookmaker ?? "—"} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">
              {isMultiple ? `Múltipla: ${legs[0]?.event_name || bet.event_name || "—"}` : bet.event_name || "—"}
            </span>
                <StatusBadgePop status={bet.status}>
                  <Badge variant="outline" className={cn("text-[10px] px-2.5 py-0.5 font-semibold uppercase tracking-wide shrink-0", STATUS_COLORS[bet.status])}>
                    {STATUS_LABELS[bet.status]}
                  </Badge>
                </StatusBadgePop>
              </div>
          <div className="text-[10px] text-muted-foreground truncate">
            {bet.bookmaker || "—"}
            {bet.market ? ` | ${bet.market}` : ""}
            {bet.selection ? ` — ${bet.selection}` : ""}
            {" | "}{dateLabel}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0 font-mono tabular-nums text-[13px]">
          <span className="text-muted-foreground">@{formatNumber(Number(bet.odds), 2)}</span>
          <span>{formatCurrency(Number(bet.stake_amount), currency)}</span>
          {clv != null && (
            <span className={cn("font-semibold", clv > 0 ? "positive" : clv < 0 ? "negative" : "")}>
              {clv > 0 ? "↑" : clv < 0 ? "↓" : ""} {formatPercent(clv)}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-mono tabular-nums text-[13px] font-semibold min-w-[84px] text-right shrink-0",
            net != null && net > 0 && "positive",
            net != null && net < 0 && "negative",
          )}
        >
          {net != null ? formatCurrency(net, currency) : "—"}
        </span>
        {quickActions("top-1/2 -translate-y-1/2 right-10")}
        {menu}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "surface group relative pl-4 pr-3 py-4 flex flex-col gap-3 motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.02] motion-safe:hover:shadow-xl h-full",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-lg",
        STATUS_ACCENT[bet.status],
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {isMultiple ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                  disabled={legs.length === 0}
                >
                  <BookmakerLogo name={bet.bookmaker ?? "—"} size="sm" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[17px] font-semibold leading-tight truncate">
                      Múltipla: {legs[0]?.event_name || bet.event_name || "—"}
                      {legs.length > 1 && (
                        <span className="text-muted-foreground font-normal"> +{legs.length - 1} jogo{legs.length - 1 > 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {legs.length} perna{legs.length !== 1 ? "s" : ""} | odd total {formatNumber(Number(bet.odds), 3)}
                    </div>
                  </div>
                  {legs.length > 0 && (
                    expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                <StatusBadgePop status={bet.status}>
                  <Badge variant="outline" className={cn("text-[10px] px-2.5 py-0.5 font-semibold uppercase tracking-wide shrink-0", STATUS_COLORS[bet.status])}>
                    {STATUS_LABELS[bet.status]}
                  </Badge>
                </StatusBadgePop>
              </div>
              {expanded && (
                <ol className="mt-2 space-y-1.5 border-l border-border/60 pl-3">
                  {legs.map((leg, idx) => (
                    <li key={leg.id} className="text-[11px] flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate">
                          <span className="text-muted-foreground">{idx + 1}.</span> {leg.event_name || "—"}
                        </div>
                        <div className="text-muted-foreground truncate">
                          {leg.market || "—"}
                          {leg.selection ? <span> — {leg.selection}</span> : null}
                          {" | "}@{formatNumber(Number(leg.odds), 2)}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-[8px] uppercase shrink-0", LEG_STATUS_COLORS[leg.status])}>
                        {LEG_STATUS_LABELS[leg.status]}
                      </Badge>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <BookmakerLogo name={bet.bookmaker ?? "—"} size="sm" className="shrink-0" />
                  <span className="text-[17px] font-semibold truncate">{bet.event_name || "—"}</span>
                </div>
                <StatusBadgePop status={bet.status}>
                  <Badge variant="outline" className={cn("text-[10px] px-2.5 py-0.5 font-semibold uppercase tracking-wide shrink-0", STATUS_COLORS[bet.status])}>
                    {STATUS_LABELS[bet.status]}
                  </Badge>
                </StatusBadgePop>
              </div>
              <div className="text-[12px] text-foreground/80 truncate mt-1.5">
                {bet.market || "—"}
                {bet.selection ? <span> — {bet.selection}</span> : null}
              </div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 mt-1.5">
                {[
                  bet.sport,
                  bet.league,
                  TYPE_LABEL[bet.bet_type] ?? bet.bet_type,
                  TIMING_LABEL[bet.timing] ?? bet.timing,
                  dateLabel,
                ]
                  .filter((p): p is string => Boolean(p))
                  .flatMap((part, i) => [
                    ...(i > 0 ? [<span key={`s${i}`} className="text-muted-foreground">•</span>] : []),
                    <span key={i}>{part}</span>,
                  ])}
              </div>
            </>
          )}
        </div>
        {quickActions("flex-col right-2 top-1/2 -translate-y-1/2")}
        {menu}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 text-[13px]">
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
            value={`${Number(bet.clv) > 0 ? "↑ " : Number(bet.clv) < 0 ? "↓ " : ""}${formatPercent(Number(bet.clv))}`}
            tone={Number(bet.clv) > 0 ? "positive" : Number(bet.clv) < 0 ? "negative" : undefined}
            mono
            strong
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

      <div className="flex items-center justify-between border-t border-border/60 pt-2 mt-1">
        <span className="text-[11px] text-muted-foreground">Lucro líquido</span>
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
  strong,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "positive" | "negative";
  mono?: boolean;
  /** Destaque extra (CLV — métrica-assinatura do produto). */
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          strong ? "font-semibold" : "font-medium",
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
