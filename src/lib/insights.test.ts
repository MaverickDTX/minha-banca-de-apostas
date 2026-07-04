import { describe, it, expect } from "vitest";
import {
  bestMarketInsight,
  worstMarketInsight,
  bestBookmakerInsight,
  redStreakInsight,
  yieldTrendInsight,
  clvBySportInsight,
  drawdownInsight,
  computeInsights,
  MIN_GROUP_BETS,
  MIN_CLV_BETS,
} from "./insights";
import type { Bet } from "@/hooks/useBets";
import type { BetStatus } from "./calc";

function makeBet(p: Partial<Bet> & { status: BetStatus; odds: number; stake_amount: number; net_profit: number; bet_date: string }): Bet {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: "u1",
    event_date: null,
    sport: "Futebol",
    league: null,
    event_name: null,
    market: null,
    selection: null,
    bookmaker: null,
    bet_type: "simples",
    timing: "pre-live",
    closing_odds: null,
    stake_units: null,
    unit_value_at_bet: null,
    gross_return: null,
    estimated_probability: null,
    implied_probability: null,
    edge: null,
    ev: null,
    kelly_fraction: null,
    recommended_stake: null,
    clv: null,
    tags: null,
    tipster: null,
    notes: null,
    external_link: null,
    created_at: p.bet_date,
    updated_at: p.bet_date,
    ...p,
  } as Bet;
}

/** N apostas iguais com datas sequenciais (1 por dia a partir de startDay). */
function repeat(
  n: number,
  base: Partial<Bet> & { status: BetStatus; odds: number; stake_amount: number; net_profit: number },
  startDay = 1,
): Bet[] {
  return Array.from({ length: n }, (_, i) =>
    makeBet({ ...base, bet_date: `2026-01-${String(startDay + i).padStart(2, "0")}T12:00:00Z` }),
  );
}

const NOW = new Date("2026-06-30T12:00:00Z");
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe("bestMarketInsight", () => {
  it("reporta o mercado mais lucrativo com N mínimo de apostas", () => {
    const bets = [
      ...repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, market: "Over 2.5" }),
      ...repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 10, market: "Handicap" }),
    ];
    const i = bestMarketInsight(bets);
    expect(i?.severity).toBe("positive");
    expect(i?.text).toContain("Over 2.5");
  });
  it("null abaixo do N mínimo", () => {
    const bets = repeat(MIN_GROUP_BETS - 1, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, market: "Over 2.5" });
    expect(bestMarketInsight(bets)).toBeNull();
  });
  it("null quando o melhor mercado não tem lucro", () => {
    const bets = repeat(MIN_GROUP_BETS, { status: "red", odds: 2, stake_amount: 100, net_profit: -100, market: "Over 2.5" });
    expect(bestMarketInsight(bets)).toBeNull();
  });
  it("ignora apostas sem mercado", () => {
    const bets = repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, market: null });
    expect(bestMarketInsight(bets)).toBeNull();
  });
});

describe("worstMarketInsight", () => {
  it("reporta o mercado com maior prejuízo", () => {
    const bets = [
      ...repeat(MIN_GROUP_BETS, { status: "red", odds: 2, stake_amount: 100, net_profit: -100, market: "Handicap" }),
      ...repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, market: "Over 2.5" }),
    ];
    const i = worstMarketInsight(bets);
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("Handicap");
  });
  it("null quando nenhum grupo qualificado dá prejuízo", () => {
    const bets = repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, market: "Over 2.5" });
    expect(worstMarketInsight(bets)).toBeNull();
  });
});

describe("bestBookmakerInsight", () => {
  it("reporta a casa com maior lucro", () => {
    const bets = [
      ...repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, bookmaker: "Bet365" }),
      ...repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 5, bookmaker: "Betano" }),
    ];
    const i = bestBookmakerInsight(bets);
    expect(i?.severity).toBe("positive");
    expect(i?.text).toContain("Bet365");
  });
  it("null abaixo do N mínimo", () => {
    const bets = repeat(MIN_GROUP_BETS - 1, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, bookmaker: "Bet365" });
    expect(bestBookmakerInsight(bets)).toBeNull();
  });
});

describe("redStreakInsight", () => {
  it("alerta com 3+ reds seguidos", () => {
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 100, bet_date: "2026-01-01T12:00:00Z" }),
      makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: "2026-01-02T12:00:00Z" }),
      makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: "2026-01-03T12:00:00Z" }),
      makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: "2026-01-04T12:00:00Z" }),
    ];
    const i = redStreakInsight(bets);
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("3 derrotas");
  });
  it("null com menos de 3 reds", () => {
    const bets = repeat(2, { status: "red", odds: 2, stake_amount: 100, net_profit: -100 });
    expect(redStreakInsight(bets)).toBeNull();
  });
  it("null quando a sequência atual é green", () => {
    const bets = [
      ...repeat(3, { status: "red", odds: 2, stake_amount: 100, net_profit: -100, }, 1),
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 100, bet_date: "2026-01-10T12:00:00Z" }),
    ];
    expect(redStreakInsight(bets)).toBeNull();
  });
});

describe("yieldTrendInsight", () => {
  // Janela recente: 5 apostas (3 green / 2 red) → yield +20%.
  // Janela anterior: 5 apostas (2 green / 3 red) → yield -20%.
  const recentUp = [
    ...Array.from({ length: 3 }, (_, i) => makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 100, bet_date: daysAgo(5 + i) })),
    ...Array.from({ length: 2 }, (_, i) => makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: daysAgo(10 + i) })),
  ];
  const previousDown = [
    ...Array.from({ length: 2 }, (_, i) => makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 100, bet_date: daysAgo(35 + i) })),
    ...Array.from({ length: 3 }, (_, i) => makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: daysAgo(40 + i) })),
  ];

  it("yield subindo → positive", () => {
    const i = yieldTrendInsight([...recentUp, ...previousDown], { now: NOW });
    expect(i?.severity).toBe("positive");
    expect(i?.text).toContain("subiu");
  });
  it("yield caindo → warning", () => {
    // Inverte as janelas: recente ruim, anterior boa.
    const recentBad = previousDown.map((b) => makeBet({ ...b, bet_date: daysAgo(5) }));
    const prevGood = recentUp.map((b) => makeBet({ ...b, bet_date: daysAgo(35) }));
    const i = yieldTrendInsight([...recentBad, ...prevGood], { now: NOW });
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("caiu");
  });
  it("null sem apostas suficientes numa das janelas", () => {
    const i = yieldTrendInsight([...recentUp, ...previousDown.slice(0, 3)], { now: NOW });
    expect(i).toBeNull();
  });
  it("null quando a variação fica abaixo do mínimo", () => {
    // Mesma composição nas duas janelas → delta 0 p.p.
    const prevSame = recentUp.map((b) => makeBet({ ...b, bet_date: daysAgo(35) }));
    const i = yieldTrendInsight([...recentUp, ...prevSame], { now: NOW });
    expect(i).toBeNull();
  });
});

describe("clvBySportInsight", () => {
  it("CLV médio positivo → positive", () => {
    const bets = repeat(MIN_CLV_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, sport: "Futebol", clv: 2.5 });
    const i = clvBySportInsight(bets);
    expect(i?.severity).toBe("positive");
    expect(i?.text).toContain("Futebol");
  });
  it("CLV médio negativo → warning", () => {
    const bets = repeat(MIN_CLV_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, sport: "Basquete", clv: -3 });
    const i = clvBySportInsight(bets);
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("Basquete");
  });
  it("null abaixo do N mínimo de CLVs registrados", () => {
    const bets = repeat(MIN_CLV_BETS - 1, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, sport: "Futebol", clv: 2 });
    expect(clvBySportInsight(bets)).toBeNull();
  });
  it("null sem CLV registrado", () => {
    const bets = repeat(MIN_CLV_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, sport: "Futebol", clv: null });
    expect(clvBySportInsight(bets)).toBeNull();
  });
});

describe("drawdownInsight", () => {
  it("alerta quando o drawdown recente se aproxima do pior histórico", () => {
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(120) }),
      makeBet({ status: "red", odds: 2, stake_amount: 900, net_profit: -900, bet_date: daysAgo(5) }),
    ];
    // Histórico: pico 1000 → cai 900 (dd -900). Recente (só a red): dd -900 = 100% do histórico.
    const i = drawdownInsight(bets, { now: NOW });
    expect(i?.severity).toBe("warning");
  });
  it("null quando o drawdown recente é pequeno vs histórico", () => {
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(120) }),
      makeBet({ status: "red", odds: 2, stake_amount: 1000, net_profit: -1000, bet_date: daysAgo(110) }),
      makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: daysAgo(5) }),
    ];
    // Histórico: dd -1100. Recente: dd -100 (9% do histórico) → sem alerta.
    expect(drawdownInsight(bets, { now: NOW })).toBeNull();
  });
  it("null sem drawdown histórico", () => {
    const bets = repeat(5, { status: "green", odds: 2, stake_amount: 100, net_profit: 100 });
    expect(drawdownInsight(bets, { now: NOW })).toBeNull();
  });
});

describe("computeInsights", () => {
  it("ordena warnings antes de positives e filtra nulls", () => {
    const bets = [
      // Mercado lucrativo (positive)...
      ...repeat(MIN_GROUP_BETS, { status: "green", odds: 2, stake_amount: 100, net_profit: 100, market: "Over 2.5" }, 1),
      // ...seguido de 3 reds no fim (warning de streak).
      ...repeat(3, { status: "red", odds: 2, stake_amount: 100, net_profit: -100, market: "Handicap" }, 20),
    ];
    const insights = computeInsights(bets, { now: NOW });
    expect(insights.length).toBeGreaterThanOrEqual(2);
    const firstPositive = insights.findIndex((i) => i.severity === "positive");
    const lastWarning = insights.map((i) => i.severity).lastIndexOf("warning");
    expect(lastWarning).toBeLessThan(firstPositive);
    expect(insights.some((i) => i.id === "red-streak")).toBe(true);
    expect(insights.some((i) => i.id === "best-market")).toBe(true);
  });
  it("lista vazia → sem insights", () => {
    expect(computeInsights([], { now: NOW })).toEqual([]);
  });
});
