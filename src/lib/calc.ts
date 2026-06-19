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
  green: "Green",
  red: "Red",
  void: "Void",
  half_green: "Half Green",
  half_red: "Half Red",
  cashout: "Cashout",
};

export const STATUS_COLORS: Record<BetStatus, string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  green: "bg-success/15 text-success border-success/30",
  red: "bg-destructive/15 text-destructive border-destructive/30",
  void: "bg-secondary text-muted-foreground border-border",
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
): number {
  switch (status) {
    case "green":
      return stake * (odds - 1);
    case "red":
      return -stake;
    case "void":
    case "pendente":
      return 0;
    case "half_green":
      return (stake * (odds - 1)) / 2;
    case "half_red":
      return -stake / 2;
    case "cashout":
      if (cashoutReturn == null) return 0;
      return cashoutReturn - stake;
  }
}

export function computeGrossReturn(
  status: BetStatus,
  stake: number,
  odds: number,
  cashoutReturn?: number | null,
): number {
  const net = computeNetProfit(status, stake, odds, cashoutReturn);
  if (status === "red" || status === "half_red") return stake + net;
  if (status === "void" || status === "pendente") return 0;
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
  return bankroll * k * fraction;
}

export function clvPercent(odds: number, closingOdds?: number | null): number | null {
  if (!closingOdds || closingOdds <= 1) return null;
  return ((odds / closingOdds) - 1) * 100;
}

export function isSettled(status: BetStatus): boolean {
  return status !== "pendente";
}

export function isWinLikeForHitRate(status: BetStatus): "win" | "loss" | "skip" {
  if (status === "green" || status === "half_green") return "win";
  if (status === "red" || status === "half_red") return "loss";
  if (status === "cashout") return "win"; // treat as resolved
  return "skip";
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
}): {
  net_profit: number;
  gross_return: number;
  implied_probability: number;
  edge: number | null;
  ev: number | null;
  kelly_fraction: number | null;
  recommended_stake: number | null;
  clv: number | null;
} {
  const cashoutReturn =
    b.status === "cashout" && b.gross_return != null ? Number(b.gross_return) : undefined;
  const net = computeNetProfit(b.status, b.stake_amount, b.odds, cashoutReturn);
  const gross = computeGrossReturn(b.status, b.stake_amount, b.odds, cashoutReturn);
  const implied = impliedProbability(b.odds);
  const estProb = b.estimated_probability;
  const edge = estProb != null ? edgeValue(estProb, b.odds) : null;
  const ev = estProb != null ? expectedValue(estProb, b.odds, b.stake_amount) : null;
  const kellyDec = estProb != null ? kellyDecimal(estProb, b.odds) : null;
  const recommended =
    estProb != null && b.bankroll != null
      ? kellyStake(estProb, b.odds, b.bankroll, b.kelly_fraction_setting ?? 0.25)
      : null;
  const clv = clvPercent(b.odds, b.closing_odds);
  return {
    net_profit: net,
    gross_return: gross,
    implied_probability: implied,
    edge,
    ev,
    kelly_fraction: kellyDec,
    recommended_stake: recommended,
    clv,
  };
}