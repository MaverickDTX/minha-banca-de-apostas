export type BetStatus =
  | "pendente"
  | "green"
  | "red"
  | "void"
  | "half_green"
  | "half_red"
  | "cashout";

export const STATUS_LABELS: Record<BetStatus, string> = {
  pendente: "Pendente",
  green: "Ganha",
  red: "Perdida",
  void: "Anulada",
  half_green: "Meio Ganha",
  half_red: "Meio Perdida",
  cashout: "Cashout",
};

export const STATUS_COLORS: Record<BetStatus, string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  green: "bg-success/15 text-success border-success/30",
  red: "bg-destructive/15 text-destructive border-destructive/30",
  void: "bg-warning/15 text-warning border-warning/30",
  half_green: "bg-success/10 text-success border-success/20",
  half_red: "bg-destructive/10 text-destructive border-destructive/20",
  cashout: "bg-accent/15 text-accent border-accent/30",
};

/** Lucro líquido de uma aposta dado status, stake, odds e (cashout) retorno opcional. */
export function computeNetProfit(
  status: BetStatus,
  stake: number,
  odds: number,
  cashoutReturn?: number | null,
  freeBet = false,
): number {
  switch (status) {
    case "green":
      return stake * (odds - 1);
    case "red":
      // Freebet (SNR): perder não custa nada — o token não era dinheiro seu.
      return freeBet ? 0 : -stake;
    case "void":
    case "pendente":
      return 0;
    case "half_green":
      return (stake * (odds - 1)) / 2;
    case "half_red":
      return freeBet ? 0 : -stake / 2;
    case "cashout":
      if (cashoutReturn == null) return 0;
      // Numa freebet, você não colocou dinheiro; o retorno do cashout é lucro líquido.
      return freeBet ? cashoutReturn : cashoutReturn - stake;
  }
}

export function computeGrossReturn(
  status: BetStatus,
  stake: number,
  odds: number,
  cashoutReturn?: number | null,
  freeBet = false,
): number {
  const net = computeNetProfit(status, stake, odds, cashoutReturn, freeBet);
  if (freeBet) {
    // Freebet (SNR): a stake não retorna. Retorno bruto = ganhos (0 se perder/anular).
    if (status === "cashout") return cashoutReturn ?? 0;
    return Math.max(0, net);
  }
  if (status === "red" || status === "half_red") return stake + net;
  if (status === "void") return stake;
  if (status === "pendente") return 0;
  if (status === "cashout") return cashoutReturn ?? 0;
  return stake + net;
}

export function impliedProbability(odds: number): number {
  if (!odds || odds <= 1) return 0;
  return (1 / odds) * 100;
}

export function edgeValue(estProb: number, odds: number): number {
  return estProb - impliedProbability(odds);
}

export function expectedValue(
  estProb: number,
  odds: number,
  stake: number,
): number {
  const p = estProb / 100;
  return p * stake * (odds - 1) - (1 - p) * stake;
}

export function kellyDecimal(estProb: number, odds: number): number {
  if (!odds || odds <= 1) return 0;
  const p = estProb / 100;
  const b = odds - 1;
  return ((b * p) - (1 - p)) / b;
}

export function kellyStake(
  estProb: number,
  odds: number,
  bankroll: number,
  fraction: number,
): number {
  const k = kellyDecimal(estProb, odds);
  // Kelly negativo = sem edge → stake recomendada é 0, nunca negativa.
  return Math.max(0, bankroll * k * fraction);
}

export function clvPercent(odds: number, closingOdds?: number | null): number | null {
  if (!closingOdds || closingOdds <= 1) return null;
  return ((odds / closingOdds) - 1) * 100;
}

export function isSettled(status: BetStatus): boolean {
  return status !== "pendente";
}

export function isWinLikeForHitRate(
  status: BetStatus,
  netProfit?: number | null,
): "win" | "loss" | "skip" {
  if (status === "green" || status === "half_green") return "win";
  if (status === "red" || status === "half_red") return "loss";
  if (status === "cashout") {
    // Classifica pelo resultado financeiro: cashout com prejuízo é derrota.
    // Break-even (0) ou lucro desconhecido não conta no hit rate (como void).
    if (netProfit == null || Number(netProfit) === 0) return "skip";
    return Number(netProfit) > 0 ? "win" : "loss";
  }
  return "skip";
}

/** Status possível de uma perna (leg) dentro de uma aposta múltipla — subconjunto de BetStatus. */
export type LegStatus = "pendente" | "green" | "red" | "void";

export interface BetLeg {
  odds: number;
  status: LegStatus;
}

/**
 * Odd total de uma múltipla: produto das odds de todas as pernas não anuladas.
 * Pernas com status "void" são tratadas como inexistentes (odd efetiva 1.0).
 */
export function computeMultipleOdds(legs: BetLeg[]): number {
  return legs
    .filter((l) => l.status !== "void")
    .reduce((acc, l) => acc * Number(l.odds || 1), 1);
}

/**
 * Status geral derivado de uma múltipla a partir das pernas:
 * - qualquer perna "red" => a múltipla toda é "red";
 * - senão, qualquer perna "pendente" => a múltipla está "pendente";
 * - senão (todas green ou void) => "green".
 * Uma múltipla onde todas as pernas são "void" é tratada como "void".
 */
export function computeMultipleStatus(legs: BetLeg[]): BetStatus {
  if (legs.length === 0) return "pendente";
  if (legs.some((l) => l.status === "red")) return "red";
  if (legs.some((l) => l.status === "pendente")) return "pendente";
  if (legs.every((l) => l.status === "void")) return "void";
  return "green";
}

/**
 * Recompute every derived field of a bet given the current values.
 * Safe to call on any patch — pass the merged "next state" of the bet.
 */
export function recomputeBetDerived(b: {
  status: BetStatus;
  odds: number;
  stake_amount: number;
  closing_odds?: number | null;
  estimated_probability?: number | null;
  gross_return?: number | null; // used as cashout return when status === "cashout"
  kelly_fraction_setting?: number; // user's preferred Kelly fraction (0..1)
  bankroll?: number;
  is_free_bet?: boolean;
  /** Quando informado (aposta múltipla), odds e status são derivados das pernas. */
  legs?: BetLeg[];
}): {
  net_profit: number;
  gross_return: number;
  implied_probability: number;
  edge: number | null;
  ev: number | null;
  kelly_fraction: number | null;
  recommended_stake: number | null;
  clv: number | null;
  status: BetStatus;
  odds: number;
} {
  const status = b.legs && b.legs.length > 0 ? computeMultipleStatus(b.legs) : b.status;
  const odds = b.legs && b.legs.length > 0 ? computeMultipleOdds(b.legs) : b.odds;
  const cashoutReturn =
    status === "cashout" && b.gross_return != null ? Number(b.gross_return) : undefined;
  const freeBet = b.is_free_bet ?? false;
  const net = computeNetProfit(status, b.stake_amount, odds, cashoutReturn, freeBet);
  const gross = computeGrossReturn(status, b.stake_amount, odds, cashoutReturn, freeBet);
  const implied = impliedProbability(odds);
  const estProb = b.estimated_probability;
  const edge = estProb != null ? edgeValue(estProb, odds) : null;
  const ev = estProb != null ? expectedValue(estProb, odds, b.stake_amount) : null;
  const kellyDec = estProb != null ? kellyDecimal(estProb, odds) : null;
  const recommended =
    estProb != null && b.bankroll != null
      ? kellyStake(estProb, odds, b.bankroll, b.kelly_fraction_setting ?? 0.25)
      : null;
  const clv = clvPercent(odds, b.closing_odds);
  return {
    net_profit: net,
    gross_return: gross,
    implied_probability: implied,
    edge,
    ev,
    kelly_fraction: kellyDec,
    recommended_stake: recommended,
    clv,
    status,
    odds,
  };
}
