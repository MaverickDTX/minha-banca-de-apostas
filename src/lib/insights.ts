import type { Bet } from "@/hooks/useBets";
import { computeMetrics, groupBy } from "./metrics";
import { isSettled } from "./calc";
import { formatCurrency, formatNumber, formatPercent } from "./format";

/**
 * Insights automáticos: regras puras sobre Bet[] que transformam agregados
 * já calculados (computeMetrics/groupBy) em frases acionáveis.
 *
 * Princípio: comparar SEMPRE com o próprio histórico do usuário — nunca
 * rótulos absolutos ("excelente", "acima da média") sem benchmark defensável.
 *
 * Cada regra retorna Insight | null (null = sem dados suficientes ou nada
 * relevante a dizer). Thresholds documentados nas constantes abaixo.
 */

export type InsightSeverity = "positive" | "warning" | "info";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  text: string;
};

export type InsightContext = {
  currency?: string;
  /** Referência temporal p/ janelas móveis — injetável p/ testes determinísticos. */
  now?: Date;
};

// ── Thresholds (documentados; ajustar aqui, não inline) ─────────────────────
/** Mínimo de apostas liquidadas num grupo (mercado/casa) p/ significância. */
export const MIN_GROUP_BETS = 10;
/** Mínimo de apostas liquidadas em cada janela de 30d p/ comparar yield. */
export const MIN_WINDOW_BETS = 5;
/** Mínimo de apostas com CLV registrado num esporte p/ reportar média. */
export const MIN_CLV_BETS = 10;
/** Sequência de reds a partir da qual alertamos (risco de tilt). */
export const RED_STREAK_ALERT = 3;
/** Variação mínima de yield (pontos percentuais) entre janelas p/ reportar. */
export const YIELD_MIN_DELTA_PP = 2;
/** Drawdown da janela recente ≥ esta fração do pior histórico → alerta. */
export const DRAWDOWN_RECENT_RATIO = 0.8;
/** Tamanho da janela móvel em dias. */
export const WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const severityRank: Record<InsightSeverity, number> = { warning: 0, positive: 1, info: 2 };

function settledOnly(bets: Bet[]): Bet[] {
  return bets.filter((b) => isSettled(b.status));
}

function inWindow(bets: Bet[], from: number, to: number): Bet[] {
  return bets.filter((b) => {
    const t = new Date(b.bet_date).getTime();
    return t >= from && t < to;
  });
}

/** Drawdown máximo dentro de um conjunto (cumulativo reinicia no conjunto). */
function drawdownOf(bets: Bet[]): number {
  return computeMetrics(bets).maxDrawdown;
}

// ── Regras ───────────────────────────────────────────────────────────────────

/** Mercado mais lucrativo (mín. MIN_GROUP_BETS liquidadas e lucro > 0). */
export function bestMarketInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const settled = settledOnly(bets).filter((b) => b.market && b.market.trim());
  const groups = groupBy(settled, (b) => b.market!.trim()).filter(
    (g) => g.metrics.settledBets >= MIN_GROUP_BETS,
  );
  if (groups.length === 0) return null;
  const best = groups.reduce((a, b) => (b.metrics.netProfit > a.metrics.netProfit ? b : a));
  if (best.metrics.netProfit <= 0) return null;
  return {
    id: "best-market",
    severity: "positive",
    text: `"${best.key}" é seu mercado mais lucrativo: ${formatCurrency(best.metrics.netProfit, ctx.currency)} em ${best.metrics.settledBets} apostas (yield ${formatPercent(best.metrics.yield, 1)}).`,
  };
}

/** Mercado menos lucrativo (mín. MIN_GROUP_BETS liquidadas e prejuízo < 0). */
export function worstMarketInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const settled = settledOnly(bets).filter((b) => b.market && b.market.trim());
  const groups = groupBy(settled, (b) => b.market!.trim()).filter(
    (g) => g.metrics.settledBets >= MIN_GROUP_BETS,
  );
  if (groups.length === 0) return null;
  const worst = groups.reduce((a, b) => (b.metrics.netProfit < a.metrics.netProfit ? b : a));
  if (worst.metrics.netProfit >= 0) return null;
  return {
    id: "worst-market",
    severity: "warning",
    text: `"${worst.key}" é seu mercado com maior prejuízo: ${formatCurrency(worst.metrics.netProfit, ctx.currency)} em ${worst.metrics.settledBets} apostas.`,
  };
}

/** Casa com maior lucro acumulado (mín. MIN_GROUP_BETS liquidadas e lucro > 0). */
export function bestBookmakerInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const settled = settledOnly(bets).filter((b) => b.bookmaker && b.bookmaker.trim());
  const groups = groupBy(settled, (b) => b.bookmaker!.trim()).filter(
    (g) => g.metrics.settledBets >= MIN_GROUP_BETS,
  );
  if (groups.length === 0) return null;
  const best = groups.reduce((a, b) => (b.metrics.netProfit > a.metrics.netProfit ? b : a));
  if (best.metrics.netProfit <= 0) return null;
  return {
    id: "best-bookmaker",
    severity: "positive",
    text: `${best.key} é a casa onde você mais lucra: ${formatCurrency(best.metrics.netProfit, ctx.currency)} em ${best.metrics.settledBets} apostas.`,
  };
}

/** Sequência atual de reds ≥ RED_STREAK_ALERT — alerta de tilt. */
export function redStreakInsight(bets: Bet[]): Insight | null {
  const m = computeMetrics(bets);
  if (m.currentStreak.type !== "red" || m.currentStreak.count < RED_STREAK_ALERT) return null;
  return {
    id: "red-streak",
    severity: "warning",
    text: `Sequência atual de ${m.currentStreak.count} derrotas. Momento de revisar stakes e critérios antes da próxima entrada — decisões no prejuízo tendem a ampliar perdas.`,
  };
}

/** Yield dos últimos 30d vs 30d anteriores (mín. MIN_WINDOW_BETS em cada janela; reporta se |Δ| ≥ YIELD_MIN_DELTA_PP). */
export function yieldTrendInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const now = (ctx.now ?? new Date()).getTime();
  const settled = settledOnly(bets);
  const recent = inWindow(settled, now - WINDOW_DAYS * DAY_MS, now + 1);
  const previous = inWindow(settled, now - 2 * WINDOW_DAYS * DAY_MS, now - WINDOW_DAYS * DAY_MS);
  if (recent.length < MIN_WINDOW_BETS || previous.length < MIN_WINDOW_BETS) return null;
  const yRecent = computeMetrics(recent).yield;
  const yPrev = computeMetrics(previous).yield;
  const delta = yRecent - yPrev;
  if (Math.abs(delta) < YIELD_MIN_DELTA_PP) return null;
  const up = delta > 0;
  return {
    id: "yield-trend",
    severity: up ? "positive" : "warning",
    text: `Yield dos últimos ${WINDOW_DAYS} dias: ${formatPercent(yRecent, 1)} — ${up ? "subiu" : "caiu"} ${formatNumber(Math.abs(delta), 1)} p.p. vs os ${WINDOW_DAYS} dias anteriores (${formatPercent(yPrev, 1)}).`,
  };
}

/** CLV médio por esporte (mín. MIN_CLV_BETS com CLV). Positivo = batendo as odds de fechamento. */
export function clvBySportInsight(bets: Bet[]): Insight | null {
  const withClv = settledOnly(bets).filter((b) => b.clv != null && b.sport && b.sport.trim());
  const groups = groupBy(withClv, (b) => b.sport!.trim()).filter(
    (g) => g.metrics.clvCount >= MIN_CLV_BETS,
  );
  if (groups.length === 0) return null;
  const best = groups.reduce((a, b) => (b.metrics.avgClv > a.metrics.avgClv ? b : a));
  if (best.metrics.avgClv > 0) {
    return {
      id: "clv-sport",
      severity: "positive",
      text: `CLV médio de ${formatPercent(best.metrics.avgClv, 1)} em ${best.key} (${best.metrics.clvCount} apostas) — você está pegando odds melhores que o fechamento.`,
    };
  }
  const worst = groups.reduce((a, b) => (b.metrics.avgClv < a.metrics.avgClv ? b : a));
  if (worst.metrics.avgClv < 0) {
    return {
      id: "clv-sport",
      severity: "warning",
      text: `CLV médio de ${formatPercent(worst.metrics.avgClv, 1)} em ${worst.key} (${worst.metrics.clvCount} apostas) — suas odds estão abaixo do fechamento; vale entrar mais cedo ou comparar casas.`,
    };
  }
  return null;
}

/** Drawdown da janela recente ≥ DRAWDOWN_RECENT_RATIO do pior histórico → alerta. */
export function drawdownInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const now = (ctx.now ?? new Date()).getTime();
  const settled = settledOnly(bets);
  const historical = drawdownOf(settled); // ≤ 0
  if (historical >= 0) return null;
  const recentBets = inWindow(settled, now - WINDOW_DAYS * DAY_MS, now + 1);
  if (recentBets.length === 0) return null;
  const recent = drawdownOf(recentBets); // ≤ 0
  if (recent > historical * DRAWDOWN_RECENT_RATIO) return null; // recente não é grave o bastante
  return {
    id: "drawdown-recent",
    severity: "warning",
    text: `Drawdown de ${formatCurrency(recent, ctx.currency)} nos últimos ${WINDOW_DAYS} dias — próximo do seu pior histórico (${formatCurrency(historical, ctx.currency)}). Atenção ao tamanho das stakes.`,
  };
}

// ── Agregador ────────────────────────────────────────────────────────────────

const RULES: ((bets: Bet[], ctx: InsightContext) => Insight | null)[] = [
  bestMarketInsight,
  worstMarketInsight,
  bestBookmakerInsight,
  (bets) => redStreakInsight(bets),
  yieldTrendInsight,
  (bets) => clvBySportInsight(bets),
  drawdownInsight,
];

/**
 * Roda todas as regras e devolve os insights ordenados por severidade
 * (warning > positive > info). A UI decide quantos exibir.
 */
export function computeInsights(bets: Bet[], ctx: InsightContext = {}): Insight[] {
  return RULES.map((rule) => rule(bets, ctx))
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
