import type { Bet } from "@/hooks/useBets";
import { computeDrawdownProfile, computeMetrics, groupBy } from "./metrics";
import { isSettled, isWinLikeForHitRate } from "./calc";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "./format";

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
  /** Valor de 1 unidade em R$ — usado quando currency === "u". */
  unitValue?: number;
  /** Referência temporal p/ janelas móveis — injetável p/ testes determinísticos. */
  now?: Date;
};

// ── Thresholds (documentados; ajustar aqui, não inline) ─────────────────────
/**
 * Mínimo de apostas liquidadas num grupo (mercado/casa) para sequer avaliá-lo.
 *
 * Não é um limiar de significância — é o piso abaixo do qual nem o erro-padrão
 * pode ser estimado com estabilidade. A significância é decidida por
 * `distinguishableFromRest`, não pela contagem.
 *
 * O valor antigo (10) produzia superlativos a partir de ruído puro: com stake
 * fixo em odds ~2,0, o erro-padrão do yield é ~100/√n p.p., isto é ~32 p.p. em
 * n = 10 — grande demais para enxergar um yield real de 5%.
 */
export const MIN_GROUP_BETS = 30;
/** Mínimo de apostas liquidadas em cada janela de 30d p/ comparar yield. */
export const MIN_WINDOW_BETS = 5;
/** Mínimo de apostas com CLV registrado num esporte p/ reportar média. */
export const MIN_CLV_BETS = 10;
/**
 * Limiar da sequência de reds — calibrado pelo próprio histórico, não fixo.
 *
 * Sob apostas independentes com taxa de derrota q constante, a probabilidade
 * de a sequência CORRENTE ter ao menos k derrotas é q^k. Um limiar fixo é
 * portanto incomparável entre estilos: com q = 0,55 (odds ~2,0) três reds
 * seguidos ocorrem ~16,6% do tempo; com q = 0,25 (favoritos em odds ~1,3),
 * ~1,6%. O mesmo "3" seria ruído num caso e evento raro no outro.
 *
 * Calibramos k como o menor inteiro com q^k < STREAK_ALERT_P, usando o q
 * observado do usuário, dentro de [RED_STREAK_MIN, RED_STREAK_MAX].
 *
 * Ressalva metodológica: independência é idealização. Apostas do mesmo dia,
 * liga ou evento são correlacionadas e a própria stake reage aos resultados,
 * de modo que q^k é ordem de grandeza para dimensionar o limiar — não um
 * p-valor de teste de hipótese, e não deve ser apresentado como tal.
 */
export const STREAK_ALERT_P = 0.05;
/** Piso do limiar: abaixo de 3 o alerta vira ruído em qualquer perfil. */
export const RED_STREAK_MIN = 3;
/** Teto do limiar: acima de 8 o alerta chegaria tarde demais para ser útil. */
export const RED_STREAK_MAX = 8;
/** Apostas decididas (green/red) mínimas para estimar q com alguma estabilidade. */
export const MIN_STREAK_CALIBRATION_BETS = 30;
/** Variação mínima de yield (pontos percentuais) entre janelas p/ reportar. */
export const YIELD_MIN_DELTA_PP = 2;
/** Drawdown corrente ≥ esta fração do pior histórico → alerta. */
export const DRAWDOWN_ALERT_RATIO = 0.8;
/** Fração do pior drawdown já recuperada acima da qual paramos de alertar. */
export const DRAWDOWN_RECOVERED_ENOUGH = 0.5;
/** Tamanho da janela móvel em dias. */
export const WINDOW_DAYS = 30;

// ── Chasing (aumento de stake após derrotas) ────────────────────────────────
/** Derrotas seguidas que caracterizam o gatilho de chasing. */
export const CHASE_AFTER_REDS = 2;
/** Apostas anteriores usadas na mediana local de stake (controla drift de banca). */
export const CHASE_BASELINE_WINDOW = 10;
/** Ocorrências mínimas do gatilho para reportar. */
export const MIN_CHASE_SAMPLES = 8;
/** Desvio mínimo na mediana das razões p/ reportar (±20%). */
export const CHASE_MIN_DEVIATION = 0.2;

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

// ── Comparação entre grupos, corrigida por seleção ──────────────────────────

/**
 * Retorno por unidade apostada de cada aposta, em pontos percentuais.
 *
 * Média NÃO ponderada por stake — mesma decisão já adotada para avgClv/avgEv
 * em metrics.ts: mede a qualidade por decisão, não o retorno por capital. O
 * yield exibido ao usuário continua sendo o ponderado; o teste estatístico usa
 * esta série, e a diferença está documentada de propósito.
 *
 * Freebets ficam fora: stake não arriscada distorce a razão.
 */
function perUnitReturns(bets: Bet[]): number[] {
  return bets
    .filter((b) => !b.is_free_bet && Number(b.stake_amount) > 0)
    .map((b) => (Number(b.net_profit || 0) / Number(b.stake_amount)) * 100);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Erro-padrão da média amostral. Infinity com n < 2 (indecidível). */
function standardError(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return Infinity;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance / n);
}

/**
 * Margem de seleção para o argmax de k grupos.
 *
 * Escolher o MELHOR entre k grupos não é uma comparação, são k comparações, e
 * o vencedor carrega o viés do vencedor (winner's curse): mesmo com vantagem
 * verdadeira idêntica e nula em todos, o máximo de k estimativas ruidosas é
 * positivo por construção e cresce com k. Simulação com k = 8 e n = 10 por
 * grupo produz um "melhor mercado" com yield médio de ~44 p.p. — inteiramente
 * ruído.
 *
 * Usamos o termo principal do valor esperado do máximo de k normais padrão
 * independentes, √(2 ln k) (teoria de valores extremos). É deliberadamente
 * conservador para k pequeno — o termo principal superestima E[máx] (k = 8:
 * 2,04 contra ≈ 1,42 real) —, o que troca poder por menos falsos positivos,
 * preferível numa tela que afirma "seu mercado mais lucrativo".
 */
export function selectionMargin(k: number): number {
  return Math.sqrt(2 * Math.log(Math.max(k, 2)));
}

export type GroupVerdict = {
  key: string;
  metrics: ReturnType<typeof computeMetrics>;
  bets: Bet[];
  /** Diferença entre a média do grupo e a do RESTO das apostas, em p.p. */
  delta: number;
  /** Limiar que |delta| precisa superar para não ser atribuível a ruído. */
  margin: number;
  /** |delta| > margin: o grupo se separa do resto do histórico do usuário. */
  distinguishable: boolean;
};

/**
 * Avalia grupos comparando cada um contra o RESTO do histórico — não contra o
 * total, que conteria o próprio grupo e deflacionaria a diferença.
 *
 * `valueOf` permite reusar a mesma máquina para yield e para CLV. Note que os
 * dois têm variâncias muito diferentes: o CLV é medido por aposta e independe
 * do resultado, então sua série é bem menos ruidosa que a de lucro — a mesma
 * regra é naturalmente mais permissiva com CLV, e isso é uma propriedade dos
 * dados, não uma exceção codificada à mão.
 */
function evaluateGroups(
  settled: Bet[],
  keyOf: (b: Bet) => string | null,
  valueOf: (bets: Bet[]) => number[],
  minBets: number,
): GroupVerdict[] {
  const keyed = settled.filter((b) => {
    const k = keyOf(b);
    return k != null && k.trim() !== "";
  });
  const groups = groupBy(keyed, (b) => keyOf(b)!.trim());
  const eligible = groups.filter((g) => valueOf(g.bets).length >= minBets);
  if (eligible.length === 0) return [];
  const margin = selectionMargin(eligible.length);

  return eligible.map((g) => {
    const inside = valueOf(g.bets);
    const outside = valueOf(keyed.filter((b) => keyOf(b)!.trim() !== g.key));
    const delta = mean(inside) - mean(outside);
    const seDiff = Math.sqrt(standardError(inside) ** 2 + standardError(outside) ** 2);
    const threshold = seDiff * margin;
    return {
      key: g.key,
      metrics: g.metrics,
      bets: g.bets,
      delta,
      margin: threshold,
      distinguishable: Number.isFinite(threshold) && Math.abs(delta) > threshold,
    };
  });
}

/** Frase de ressalva quando o grupo lidera mas não se separa do ruído. */
function inconclusiveNote(v: GroupVerdict): string {
  return `A diferença (${formatNumber(v.delta, 1)} p.p.) ainda está dentro do que a variância explica para esse volume — não é evidência de vantagem.`;
}

// ── Regras ───────────────────────────────────────────────────────────────────

/**
 * Mercado que se separa POSITIVAMENTE do resto do histórico.
 *
 * Só afirma "mais lucrativo" quando a diferença supera a margem de seleção;
 * caso contrário degrada para `info` e diz explicitamente que o número está
 * dentro da variância, em vez de calar ou de mentir.
 */
export function bestMarketInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const verdicts = evaluateGroups(
    settledOnly(bets),
    (b) => b.market,
    perUnitReturns,
    MIN_GROUP_BETS,
  );
  if (verdicts.length === 0) return null;
  const best = verdicts.reduce((a, b) => (b.delta > a.delta ? b : a));
  if (best.metrics.netProfit <= 0 || best.delta <= 0) return null;

  const head = `"${best.key}": ${formatCurrency(best.metrics.netProfit, ctx.currency, ctx.unitValue)} em ${best.metrics.settledBets} apostas (yield ${formatPercent(best.metrics.yield, 1)}).`;
  return best.distinguishable
    ? {
        id: "best-market",
        severity: "positive",
        text: `${head} É seu melhor mercado por margem que a variância não explica — ${formatNumber(best.delta, 1)} p.p. acima do resto do seu histórico.`,
      }
    : { id: "best-market", severity: "info", text: `${head} ${inconclusiveNote(best)}` };
}

/** Mercado que se separa NEGATIVAMENTE do resto do histórico. */
export function worstMarketInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const verdicts = evaluateGroups(
    settledOnly(bets),
    (b) => b.market,
    perUnitReturns,
    MIN_GROUP_BETS,
  );
  if (verdicts.length === 0) return null;
  const worst = verdicts.reduce((a, b) => (b.delta < a.delta ? b : a));
  if (worst.metrics.netProfit >= 0 || worst.delta >= 0) return null;

  const head = `"${worst.key}": ${formatCurrency(worst.metrics.netProfit, ctx.currency, ctx.unitValue)} em ${worst.metrics.settledBets} apostas.`;
  return worst.distinguishable
    ? {
        id: "worst-market",
        severity: "warning",
        text: `${head} Rende ${formatNumber(Math.abs(worst.delta), 1)} p.p. abaixo do resto do seu histórico, diferença grande demais para ser variância.`,
      }
    : { id: "worst-market", severity: "info", text: `${head} ${inconclusiveNote(worst)}` };
}

/**
 * Casa que se separa positivamente do resto do histórico.
 *
 * Ressalva de interpretação, deliberadamente refletida no texto: a escolha da
 * casa é confundida com QUE apostas vão para ela. Lucrar mais numa casa pode
 * refletir odds e limites melhores, ou apenas o fato de as apostas boas serem
 * direcionadas para lá. A regra reporta a associação; não afirma causa.
 */
export function bestBookmakerInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const verdicts = evaluateGroups(
    settledOnly(bets),
    (b) => b.bookmaker,
    perUnitReturns,
    MIN_GROUP_BETS,
  );
  if (verdicts.length === 0) return null;
  const best = verdicts.reduce((a, b) => (b.delta > a.delta ? b : a));
  if (best.metrics.netProfit <= 0 || best.delta <= 0) return null;

  const head = `${best.key}: ${formatCurrency(best.metrics.netProfit, ctx.currency, ctx.unitValue)} em ${best.metrics.settledBets} apostas.`;
  return best.distinguishable
    ? {
        id: "best-bookmaker",
        severity: "positive",
        text: `${head} Rende ${formatNumber(best.delta, 1)} p.p. acima do resto do seu histórico — vale checar se é a odd da casa ou o tipo de aposta que você manda para lá.`,
      }
    : {
        id: "best-bookmaker",
        severity: "info",
        text: `${head} ${inconclusiveNote(best)}`,
      };
}

/** Taxa de derrota histórica (q) sobre apostas decididas. Voids/pushes não contam. */
function lossRate(bets: Bet[]): { q: number; decided: number } {
  let wins = 0;
  let losses = 0;
  for (const b of settledOnly(bets)) {
    const t = isWinLikeForHitRate(b.status, b.net_profit);
    if (t === "win") wins++;
    else if (t === "loss") losses++;
  }
  const decided = wins + losses;
  return { q: decided > 0 ? losses / decided : 0, decided };
}

/**
 * Menor k inteiro com q^k < STREAK_ALERT_P, limitado a [RED_STREAK_MIN, RED_STREAK_MAX].
 * Exposto para teste e para a UI poder explicar o limiar ao usuário.
 */
export function calibratedStreakThreshold(q: number): number {
  if (q <= 0) return RED_STREAK_MAX; // sem derrotas: nada a alertar
  if (q >= 1) return RED_STREAK_MIN; // só derrotas: qualquer sequência é o padrão
  const k = Math.ceil(Math.log(STREAK_ALERT_P) / Math.log(q));
  return Math.min(RED_STREAK_MAX, Math.max(RED_STREAK_MIN, k));
}

/**
 * Sequência corrente de reds acima do que o histórico do usuário torna comum.
 *
 * Antes de MIN_STREAK_CALIBRATION_BETS apostas decididas o q é instável, então
 * caímos no piso RED_STREAK_MIN em vez de calibrar sobre ruído.
 */
export function redStreakInsight(bets: Bet[]): Insight | null {
  const m = computeMetrics(bets);
  if (m.currentStreak.type !== "red") return null;
  const { q, decided } = lossRate(bets);
  const threshold =
    decided >= MIN_STREAK_CALIBRATION_BETS ? calibratedStreakThreshold(q) : RED_STREAK_MIN;
  if (m.currentStreak.count < threshold) return null;

  const calibrated = decided >= MIN_STREAK_CALIBRATION_BETS && q > 0 && q < 1;
  const expected = calibrated
    ? ` Pelo seu histórico (${formatPercent(q * 100, 0)} de derrotas), uma sequência assim aparece em cerca de ${formatPercent(Math.pow(q, m.currentStreak.count) * 100, 1)} do tempo.`
    : "";
  return {
    id: "red-streak",
    severity: "warning",
    text: `Sequência atual de ${m.currentStreak.count} derrotas.${expected} Vale revisar critérios de entrada antes da próxima aposta.`,
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

/**
 * CLV médio por esporte.
 *
 * O CLV é medido POR APOSTA e independe do resultado: compara a odd obtida com
 * a de fechamento, sem o ruído binário do green/red. Sua série é por isso muito
 * menos volátil que a de lucro, e a mesma máquina estatística das regras de
 * mercado aprova amostras bem menores aqui. Isso é propriedade dos dados, não
 * exceção codificada — MIN_CLV_BETS pode continuar em 10 justamente por isso.
 *
 * Como o CLV é o melhor preditor disponível de vantagem de longo prazo, aqui a
 * comparação é contra ZERO (bater o fechamento), e não contra o resto do
 * histórico: um CLV negativo é ruim mesmo que seja o menos ruim da carteira.
 */
export function clvBySportInsight(bets: Bet[]): Insight | null {
  const withClv = settledOnly(bets).filter((b) => b.clv != null);
  const clvValues = (bs: Bet[]) => bs.filter((b) => b.clv != null).map((b) => Number(b.clv));
  const verdicts = evaluateGroups(withClv, (b) => b.sport, clvValues, MIN_CLV_BETS);
  if (verdicts.length === 0) return null;

  const k = verdicts.length;
  const beatsZero = (v: GroupVerdict) => {
    const xs = clvValues(v.bets);
    const se = standardError(xs);
    return Number.isFinite(se) && Math.abs(mean(xs)) > se * selectionMargin(k);
  };

  const best = verdicts.reduce((a, b) => (b.metrics.avgClv > a.metrics.avgClv ? b : a));
  if (best.metrics.avgClv > 0 && beatsZero(best)) {
    return {
      id: "clv-sport",
      severity: "positive",
      text: `CLV médio de ${formatPercent(best.metrics.avgClv, 1)} em ${best.key} (${best.metrics.clvCount} apostas) — você está pegando odds consistentemente melhores que o fechamento.`,
    };
  }
  const worst = verdicts.reduce((a, b) => (b.metrics.avgClv < a.metrics.avgClv ? b : a));
  if (worst.metrics.avgClv < 0 && beatsZero(worst)) {
    return {
      id: "clv-sport",
      severity: "warning",
      text: `CLV médio de ${formatPercent(worst.metrics.avgClv, 1)} em ${worst.key} (${worst.metrics.clvCount} apostas) — suas odds estão abaixo do fechamento; vale entrar mais cedo ou comparar casas.`,
    };
  }
  return null;
}

/**
 * Situação na curva de lucro medida contra o high-water mark.
 *
 * Diferente da versão anterior, NÃO compara o drawdown de uma janela isolada
 * (cuja curva reinicia em zero e por construção nunca supera o histórico) com
 * o drawdown global. Usa `currentDrawdown` — a distância real até o topo — e
 * a data do fundo para distinguir três situações que exigem frases diferentes:
 *
 *  1. no-fundo   — o pior drawdown da história É o de agora, ainda sem recuperação;
 *  2. recuperando — o recorde foi tocado recentemente e parte já foi recuperada;
 *  3. submerso   — abaixo do topo, perto do pior histórico, sem ser recorde.
 *
 * Silencia quando a curva já recuperou mais de DRAWDOWN_RECOVERED_ENOUGH do
 * pior drawdown ou quando a posição atual está longe do recorde.
 */
export function drawdownInsight(bets: Bet[], ctx: InsightContext = {}): Insight | null {
  const now = (ctx.now ?? new Date()).getTime();
  const settled = settledOnly(bets);
  const dd = computeDrawdownProfile(settled);
  if (dd.maxDrawdown >= 0 || dd.currentDrawdown >= 0) return null; // nunca caiu, ou está no topo

  const worst = formatCurrency(dd.maxDrawdown, ctx.currency, ctx.unitValue);
  const current = formatCurrency(dd.currentDrawdown, ctx.currency, ctx.unitValue);
  const atRecord = dd.currentDrawdown <= dd.maxDrawdown; // no fundo da própria história
  const troughIsRecent =
    dd.troughDate != null && new Date(dd.troughDate).getTime() >= now - WINDOW_DAYS * DAY_MS;

  if (atRecord) {
    return {
      id: "drawdown",
      severity: "warning",
      text: `Você está no maior drawdown da sua história: ${worst}, sem nenhuma recuperação desde o topo${dd.peakDate ? ` de ${formatDate(dd.peakDate)}` : ""}. Reduzir o tamanho das stakes até a curva reagir limita o estrago de uma sequência ruim que continue.`,
    };
  }

  const recovered = dd.recoveredFraction;
  if (troughIsRecent && recovered <= DRAWDOWN_RECOVERED_ENOUGH) {
    return {
      id: "drawdown",
      severity: "warning",
      text: `Seu maior drawdown (${worst}) foi atingido em ${formatDate(dd.troughDate!)}. Você já recuperou ${formatPercent(recovered * 100, 0)} dele e ainda está ${current} abaixo do topo.`,
    };
  }

  if (dd.currentDrawdown <= dd.maxDrawdown * DRAWDOWN_ALERT_RATIO) {
    return {
      id: "drawdown",
      severity: "warning",
      text: `Você está ${current} abaixo do seu topo — ${formatPercent((dd.currentDrawdown / dd.maxDrawdown) * 100, 0)} do seu pior drawdown (${worst}). Atenção ao tamanho das stakes.`,
    };
  }

  return null;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Chasing: a stake sobe depois de uma sequência de derrotas?
 *
 * Diferente das demais regras, esta não mede resultado — mede COMPORTAMENTO, e
 * por isso acrescenta informação em vez de reformular "você está perdendo".
 *
 * Método: para cada aposta precedida por ≥ CHASE_AFTER_REDS derrotas seguidas,
 * calcula-se a razão entre sua stake e a MEDIANA LOCAL das CHASE_BASELINE_WINDOW
 * stakes anteriores. A mediana local — e não a média global — é deliberada: a
 * stake cresce naturalmente com a banca ao longo do tempo, e uma média global
 * confundiria esse drift com chasing se as perdas se concentrassem no fim do
 * histórico. A mediana das razões resiste a outliers de stake pontuais.
 *
 * Direção: sob critério de Kelly (Kelly, 1956, "A New Interpretation of
 * Information Rate"), a stake ótima é proporcional à banca — logo DEVE cair
 * após perdas. Subir a stake depois de derrotas é o oposto da prescrição, e
 * reduzi-la é consistente com ela; daí o warning num sentido e o positive no
 * outro.
 *
 * Freebets ficam fora: a stake não é capital arriscado e distorceria a razão.
 */
export function chasingInsight(bets: Bet[]): Insight | null {
  const ordered = settledOnly(bets)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.bet_date).getTime() - new Date(b.bet_date).getTime() ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const priorStakes: number[] = [];
  const ratios: number[] = [];
  let lossRun = 0;

  for (const b of ordered) {
    const stake = Number(b.stake_amount || 0);
    const usable = !b.is_free_bet && stake > 0;

    if (usable && lossRun >= CHASE_AFTER_REDS && priorStakes.length >= CHASE_BASELINE_WINDOW) {
      const base = median(priorStakes.slice(-CHASE_BASELINE_WINDOW));
      if (base > 0) ratios.push(stake / base);
    }
    if (usable) priorStakes.push(stake);

    const t = isWinLikeForHitRate(b.status, b.net_profit);
    if (t === "loss") lossRun++;
    else if (t === "win") lossRun = 0;
    // "skip" (void/push) não interrompe nem alimenta a sequência.
  }

  if (ratios.length < MIN_CHASE_SAMPLES) return null;
  const med = median(ratios);
  const delta = med - 1;

  if (delta >= CHASE_MIN_DEVIATION) {
    return {
      id: "chasing",
      severity: "warning",
      text: `Depois de ${CHASE_AFTER_REDS}+ derrotas seguidas, sua stake sobe ${formatPercent(delta * 100, 0)} acima do seu padrão (${ratios.length} ocorrências). Aumentar a aposta no prejuízo é o inverso do que o critério de Kelly prescreve — a stake deveria acompanhar a banca para baixo.`,
    };
  }
  if (delta <= -CHASE_MIN_DEVIATION) {
    return {
      id: "chasing",
      severity: "positive",
      text: `Depois de ${CHASE_AFTER_REDS}+ derrotas seguidas, você reduz a stake em ${formatPercent(Math.abs(delta) * 100, 0)} (${ratios.length} ocorrências) — disciplina consistente com o dimensionamento proporcional à banca.`,
    };
  }
  return null;
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
  (bets) => chasingInsight(bets),
];

/**
 * Regras que descrevem o MESMO fenômeno — "estou num momento ruim" — por
 * ângulos diferentes. Numa fase de perdas as três disparam juntas e a lista
 * vira três frases dizendo a mesma coisa, o que ainda expulsa os insights
 * positivos do corte da UI. Só a de maior prioridade sobrevive.
 *
 * Ordem deliberada: o drawdown mede o risco de capital (mais grave e mais
 * raro); a sequência de reds é o gatilho comportamental imediato; a tendência
 * de yield é o sinal mais lento e o menos acionável dos três.
 *
 * Aplica-se apenas a warnings: `yield-trend` positivo não é suprimido.
 */
export const DOWNTURN_FAMILY = ["drawdown", "red-streak", "yield-trend"] as const;

function dedupeDownturn(insights: Insight[]): Insight[] {
  const family = new Set<string>(DOWNTURN_FAMILY);
  const winner = DOWNTURN_FAMILY.find((id) =>
    insights.some((i) => i.id === id && i.severity === "warning"),
  );
  if (!winner) return insights;
  return insights.filter(
    (i) => !(family.has(i.id) && i.severity === "warning") || i.id === winner,
  );
}

/**
 * Roda todas as regras e devolve os insights ordenados por severidade
 * (warning > positive > info). A UI decide quantos exibir.
 */
export function computeInsights(bets: Bet[], ctx: InsightContext = {}): Insight[] {
  const raw = RULES.map((rule) => rule(bets, ctx)).filter((i): i is Insight => i !== null);
  return dedupeDownturn(raw).sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
