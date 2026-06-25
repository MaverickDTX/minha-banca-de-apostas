import { describe, it, expect } from "vitest";
import { computeMetrics, computeBankroll, groupBy, oddsBucket } from "./metrics";
import type { Bet } from "@/hooks/useBets";
import type { BankrollTx } from "@/hooks/useTransactions";
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

const A = makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 100, bet_date: "2026-01-01T12:00:00Z" });
const B = makeBet({ status: "red", odds: 1.5, stake_amount: 100, net_profit: -100, bet_date: "2026-01-02T12:00:00Z" });
const C = makeBet({ status: "green", odds: 3, stake_amount: 50, net_profit: 100, bet_date: "2026-01-03T12:00:00Z" });
const D = makeBet({ status: "pendente", odds: 2, stake_amount: 100, net_profit: 0, bet_date: "2026-01-04T12:00:00Z" });

describe("computeMetrics", () => {
  const m = computeMetrics([A, B, C, D]);

  it("conta totais, liquidadas e pendentes", () => {
    expect(m.totalBets).toBe(4);
    expect(m.settledBets).toBe(3);
    expect(m.pendingBets).toBe(1);
  });
  it("soma stake total e stake liquidada", () => {
    expect(m.stakeTotal).toBe(350);
    expect(m.settledStake).toBe(250);
  });
  it("lucro líquido só das liquidadas", () => {
    expect(m.netProfit).toBe(100);
  });
  it("ROI e yield = lucro / stake liquidada", () => {
    expect(m.roi).toBeCloseTo(40, 6);
    expect(m.yield).toBeCloseTo(40, 6);
  });
  it("taxa de acerto = wins / (wins+losses)", () => {
    expect(m.hitRate).toBeCloseTo(66.667, 3);
  });
  it("odd média das liquidadas e stake média de todas", () => {
    expect(m.avgOdds).toBeCloseTo(2.1667, 3);
    expect(m.avgStake).toBeCloseTo(87.5, 6);
  });
  it("maior drawdown", () => {
    expect(m.maxDrawdown).toBe(-100);
  });
  it("sequência atual (último resultado green)", () => {
    expect(m.currentStreak).toEqual({ type: "green", count: 1 });
  });
  it("maior green e maior red", () => {
    expect(m.bestGreen).toBe(100);
    expect(m.worstRed).toBe(-100);
  });

  it("lista vazia não quebra (zeros)", () => {
    const z = computeMetrics([]);
    expect(z.roi).toBe(0);
    expect(z.hitRate).toBe(0);
    expect(z.netProfit).toBe(0);
    expect(z.currentStreak).toEqual({ type: "none", count: 0 });
  });

  it("sequência conta múltiplos greens seguidos e ignora void", () => {
    const v = makeBet({ status: "void", odds: 2, stake_amount: 10, net_profit: 0, bet_date: "2026-01-05T12:00:00Z" });
    const m2 = computeMetrics([A, C, v]); // ordenado: A green, C green, void(skip)
    expect(m2.currentStreak).toEqual({ type: "green", count: 2 });
  });
});

describe("computeBankroll", () => {
  const txs: BankrollTx[] = [
    { id: "1", user_id: "u1", tx_date: "2026-01-01", tx_type: "deposit", amount: 500, bookmaker: null, notes: null, created_at: "2026-01-01" },
    { id: "2", user_id: "u1", tx_date: "2026-01-02", tx_type: "withdrawal", amount: 200, bookmaker: null, notes: null, created_at: "2026-01-02" },
    { id: "3", user_id: "u1", tx_date: "2026-01-03", tx_type: "bonus", amount: 50, bookmaker: null, notes: null, created_at: "2026-01-03" },
    { id: "4", user_id: "u1", tx_date: "2026-01-04", tx_type: "adjustment", amount: -30, bookmaker: null, notes: null, created_at: "2026-01-04" },
  ];
  const bank = computeBankroll(1000, [A, B, C, D], txs);

  it("separa cada tipo de transação", () => {
    expect(bank.deposits).toBe(500);
    expect(bank.withdrawals).toBe(200);
    expect(bank.bonuses).toBe(50);
    expect(bank.adjustments).toBe(-30);
  });
  it("lucro de apostas só das liquidadas", () => {
    expect(bank.betsProfit).toBe(100);
  });
  it("banca atual considera ajuste negativo", () => {
    // 1000 + 500 - 200 + 50 - 30 + 100 = 1420
    expect(bank.current).toBe(1420);
  });
  it("capital depositado = inicial + depósitos", () => {
    expect(bank.capitalDeposited).toBe(1500);
  });
});

describe("groupBy", () => {
  it("agrupa por chave e calcula métricas por grupo", () => {
    const groups = groupBy([A, B, C, D], (b) => b.status);
    const green = groups.find((g) => g.key === "green");
    expect(green?.bets).toHaveLength(2);
    expect(green?.metrics.netProfit).toBe(200);
  });
  it("chave vazia vira '—'", () => {
    const groups = groupBy([A], () => "");
    expect(groups[0].key).toBe("—");
  });
});

describe("oddsBucket", () => {
  it("classifica faixas de odds", () => {
    expect(oddsBucket(1.2)).toBe("1.01–1.49");
    expect(oddsBucket(1.5)).toBe("1.50–1.79");
    expect(oddsBucket(2.0)).toBe("1.80–2.09");
    expect(oddsBucket(2.5)).toBe("2.10–2.99");
    expect(oddsBucket(3.0)).toBe("3.00+");
  });
});
