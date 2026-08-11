import type { Bet } from "@/hooks/useBets";
import type { BankrollTx } from "@/hooks/useTransactions";
import { isSettled, isWinLikeForHitRate } from "./calc";

export type Metrics = {
  totalBets: number;
  settledBets: number;
  pendingBets: number;
  stakeTotal: number;
  settledStake: number;
  netProfit: number;
  /** Yield = lucro / total apostado (turnover) das liquidadas. % */
  yield: number;
  hitRate: number;        // %
  avgOdds: number;
  avgStake: number;
  maxDrawdown: number;
  currentStreak: { type: "green" | "red" | "none"; count: number };
  bestGreen: number;
  worstRed: number;
  avgClv: number;
  avgEv: number;
  /** Nº de apostas com CLV/EV registrado — 0 permite à UI exibir "—" em vez de 0,00. */
  clvCount: number;
  evCount: number;
};

/**
 * Perfil de drawdown da curva de lucro acumulado (P&L), medido a partir do
 * high-water mark — o maior valor já atingido pela curva.
 *
 * Nota metodológica: a curva começa em 0 e o pico inicial é 0, de modo que
 * todos os valores são RELATIVOS ao conjunto recebido, não à banca absoluta.
 * Um subconjunto (ex.: últimos 30 dias) tem sua própria curva reiniciada e
 * NÃO é comparável ao perfil do histórico completo — para medir a situação
 * recente na curva real, use `currentDrawdown` do histórico completo.
 */
export type DrawdownProfile = {
  /** Pior queda já registrada a partir de um pico. ≤ 0. */
  maxDrawdown: number;
  /** Distância atual até o high-water mark. ≤ 0; 0 = a curva está no topo. */
  currentDrawdown: number;
  /** bet_date em que o pior drawdown foi tocado (fundo). null se nunca houve. */
  troughDate: string | null;
  /** bet_date do último high-water mark. null se a curva nunca superou 0. */
  peakDate: string | null;
  /**
   * Fração do pior drawdown já recuperada: 0 = ainda no fundo,
   * 1 = curva de volta ao topo. Vale 1 quando nunca houve drawdown.
   */
  recoveredFraction: number;
};

/**
 * Ordena as liquidadas por data. Desempate por created_at: sem ele, apostas do
 * mesmo bet_date teriam ordem indeterminada e drawdown/streak variariam entre
 * execuções.
 */
function orderSettled(bets: Bet[]): Bet[] {
  return bets
    .filter((b) => isSettled(b.status))
    .sort(
      (a, b) =>
        new Date(a.bet_date).getTime() - new Date(b.bet_date).getTime() ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
}

/** Percorre a curva já ordenada uma única vez. Fonte única do drawdown. */
function drawdownFrom(ordered: Bet[]): DrawdownProfile {
  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  let troughDate: string | null = null;
  let peakDate: string | null = null;
  for (const b of ordered) {
    cum += Number(b.net_profit || 0);
    if (cum > peak) {
      peak = cum;
      peakDate = b.bet_date;
    }
    const dd = cum - peak;
    if (dd < maxDd) {
      maxDd = dd;
      troughDate = b.bet_date;
    }
  }
  const currentDrawdown = cum - peak;
  return {
    maxDrawdown: maxDd,
    currentDrawdown,
    troughDate,
    peakDate,
    recoveredFraction: maxDd < 0 ? 1 - currentDrawdown / maxDd : 1,
  };
}

export function computeDrawdownProfile(bets: Bet[]): DrawdownProfile {
  return drawdownFrom(orderSettled(bets));
}

export function computeMetrics(bets: Bet[]): Metrics {
  const settled = bets.filter((b) => isSettled(b.status));
  // Freebets não são capital real arriscado — a stake não entra no turnover (yield/ROI).
  const settledStake = settled.reduce((s, b) => s + (b.is_free_bet ? 0 : Number(b.stake_amount || 0)), 0);
  const netProfit = settled.reduce((s, b) => s + Number(b.net_profit || 0), 0);
  const stakeTotal = bets.reduce((s, b) => s + (b.is_free_bet ? 0 : Number(b.stake_amount || 0)), 0);
  const hitCount = settled.filter((b) => isWinLikeForHitRate(b.status, b.net_profit) === "win").length;
  const lossCount = settled.filter((b) => isWinLikeForHitRate(b.status, b.net_profit) === "loss").length;
  const hitTotal = hitCount + lossCount;
  const avgOdds = settled.length ? settled.reduce((s, b) => s + Number(b.odds), 0) / settled.length : 0;
  const avgStake = bets.length ? stakeTotal / bets.length : 0;

  // Curva acumulada + drawdown. Uma ordenação só, reaproveitada pela streak.
  const ordered = orderSettled(settled);
  const { maxDrawdown: maxDd } = drawdownFrom(ordered);

  // Current streak
  let streakType: "green" | "red" | "none" = "none";
  let streakCount = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const t = isWinLikeForHitRate(ordered[i].status, ordered[i].net_profit);
    if (t === "skip") continue;
    const cur = t === "win" ? "green" : "red";
    if (streakType === "none") { streakType = cur; streakCount = 1; continue; }
    if (cur === streakType) streakCount++;
    else break;
  }

  const bestGreen = settled.reduce((m, b) => Math.max(m, Number(b.net_profit || 0)), 0);
  const worstRed = settled.reduce((m, b) => Math.min(m, Number(b.net_profit || 0)), 0);

  // avgClv/avgEv: média aritmética simples por aposta (não ponderada por stake).
  // Decisão deliberada: mede habilidade por decisão, não retorno por capital.
  const clvBets = settled.filter((b) => b.clv != null);
  const avgClv = clvBets.length ? clvBets.reduce((s, b) => s + Number(b.clv), 0) / clvBets.length : 0;
  const evBets = settled.filter((b) => b.ev != null);
  const avgEv = evBets.length ? evBets.reduce((s, b) => s + Number(b.ev), 0) / evBets.length : 0;

  return {
    totalBets: bets.length,
    settledBets: settled.length,
    pendingBets: bets.length - settled.length,
    stakeTotal,
    settledStake,
    netProfit,
    yield: settledStake > 0 ? (netProfit / settledStake) * 100 : 0,
    hitRate: hitTotal > 0 ? (hitCount / hitTotal) * 100 : 0,
    avgOdds,
    avgStake,
    maxDrawdown: maxDd,
    currentStreak: { type: streakType, count: streakCount },
    bestGreen,
    worstRed,
    avgClv,
    avgEv,
    clvCount: clvBets.length,
    evCount: evBets.length,
  };
}

export function computeBankroll(
  initial: number,
  bets: Bet[],
  txs: BankrollTx[],
): {
  current: number;
  deposits: number;
  withdrawals: number;
  bonuses: number;
  adjustments: number;
  betsProfit: number;
  capitalDeposited: number;
} {
  let deposits = 0, withdrawals = 0, bonuses = 0, adjustments = 0;
  for (const t of txs) {
    const amt = Number(t.amount);
    if (t.tx_type === "deposit") deposits += amt;
    else if (t.tx_type === "withdrawal") withdrawals += amt;
    else if (t.tx_type === "bonus") bonuses += amt;
    else if (t.tx_type === "adjustment") adjustments += amt;
  }
  const betsProfit = bets
    .filter((b) => isSettled(b.status))
    .reduce((s, b) => s + Number(b.net_profit || 0), 0);
  const current = Number(initial) + deposits - withdrawals + bonuses + adjustments + betsProfit;
  return {
    current,
    deposits,
    withdrawals,
    bonuses,
    adjustments,
    betsProfit,
    capitalDeposited: Number(initial) + deposits,
  };
}

/** Group bets by a key returning aggregated metrics per group. */
export function groupBy(bets: Bet[], keyFn: (b: Bet) => string): { key: string; bets: Bet[]; metrics: Metrics }[] {
  const map = new Map<string, Bet[]>();
  for (const b of bets) {
    const k = keyFn(b) || "—";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(b);
  }
  return Array.from(map.entries()).map(([key, bs]) => ({ key, bets: bs, metrics: computeMetrics(bs) }));
}

export function oddsBucket(odds: number): string {
  if (odds < 1.5) return "1.01–1.49";
  if (odds < 1.8) return "1.50–1.79";
  if (odds < 2.1) return "1.80–2.09";
  if (odds < 3) return "2.10–2.99";
  return "3.00+";
}
