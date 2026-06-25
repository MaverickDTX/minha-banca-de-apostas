import { describe, it, expect } from "vitest";
import {
  computeNetProfit,
  computeGrossReturn,
  impliedProbability,
  edgeValue,
  expectedValue,
  kellyDecimal,
  kellyStake,
  clvPercent,
  isSettled,
  isWinLikeForHitRate,
  recomputeBetDerived,
} from "./calc";

describe("computeNetProfit", () => {
  it("green = stake * (odds - 1)", () => {
    expect(computeNetProfit("green", 100, 2.5)).toBe(150);
  });
  it("red = -stake", () => {
    expect(computeNetProfit("red", 100, 2.5)).toBe(-100);
  });
  it("void e pendente = 0", () => {
    expect(computeNetProfit("void", 100, 2.5)).toBe(0);
    expect(computeNetProfit("pendente", 100, 2.5)).toBe(0);
  });
  it("half_green = metade do lucro", () => {
    expect(computeNetProfit("half_green", 100, 2.5)).toBe(75);
  });
  it("half_red = metade do prejuízo", () => {
    expect(computeNetProfit("half_red", 100, 2.5)).toBe(-50);
  });
  it("cashout = retorno - stake", () => {
    expect(computeNetProfit("cashout", 100, 2.5, 120)).toBe(20);
    expect(computeNetProfit("cashout", 100, 2.5, 80)).toBe(-20);
  });
  it("cashout sem retorno informado = 0", () => {
    expect(computeNetProfit("cashout", 100, 2.5, null)).toBe(0);
    expect(computeNetProfit("cashout", 100, 2.5)).toBe(0);
  });
});

describe("computeGrossReturn", () => {
  it("green devolve stake + lucro", () => {
    expect(computeGrossReturn("green", 100, 2.5)).toBe(250);
  });
  it("red devolve 0 (perde a stake)", () => {
    expect(computeGrossReturn("red", 100, 2.5)).toBe(0);
  });
  it("half_green devolve stake + metade do lucro", () => {
    expect(computeGrossReturn("half_green", 100, 2.5)).toBe(175);
  });
  it("half_red devolve metade da stake", () => {
    expect(computeGrossReturn("half_red", 100, 2.5)).toBe(50);
  });
  it("cashout devolve o retorno informado", () => {
    expect(computeGrossReturn("cashout", 100, 2.5, 120)).toBe(120);
  });
});

describe("impliedProbability", () => {
  it("odds 2.0 = 50%", () => {
    expect(impliedProbability(2)).toBe(50);
  });
  it("odds 4.0 = 25%", () => {
    expect(impliedProbability(4)).toBe(25);
  });
  it("odds <= 1 retorna 0", () => {
    expect(impliedProbability(1)).toBe(0);
    expect(impliedProbability(0)).toBe(0);
  });
});

describe("edgeValue", () => {
  it("prob estimada - prob implícita", () => {
    expect(edgeValue(60, 2)).toBe(10);
    expect(edgeValue(40, 2)).toBe(-10);
  });
});

describe("expectedValue", () => {
  it("EV positivo quando prob estimada > implícita", () => {
    // p=0.6, odds 2.0, stake 100 => 0.6*100*1 - 0.4*100 = 20
    expect(expectedValue(60, 2, 100)).toBeCloseTo(20, 6);
  });
  it("EV zero no ponto justo", () => {
    expect(expectedValue(50, 2, 100)).toBeCloseTo(0, 6);
  });
});

describe("kellyDecimal", () => {
  it("fração de Kelly para vantagem", () => {
    // b=1, p=0.6 => (0.6 - 0.4)/1 = 0.2
    expect(kellyDecimal(60, 2)).toBeCloseTo(0.2, 6);
  });
  it("negativo quando sem vantagem", () => {
    expect(kellyDecimal(40, 2)).toBeCloseTo(-0.2, 6);
  });
  it("odds <= 1 retorna 0", () => {
    expect(kellyDecimal(60, 1)).toBe(0);
  });
});

describe("kellyStake", () => {
  it("aplica banca e fração", () => {
    // kelly 0.2 * banca 1000 * fração 0.25 = 50
    expect(kellyStake(60, 2, 1000, 0.25)).toBeCloseTo(50, 6);
  });
});

describe("clvPercent", () => {
  it("ganho de CLV quando odd > closing", () => {
    expect(clvPercent(2, 1.8)).toBeCloseTo(11.111, 3);
  });
  it("CLV negativo quando odd < closing", () => {
    expect(clvPercent(1.8, 2)).toBeCloseTo(-10, 6);
  });
  it("sem closing odd retorna null", () => {
    expect(clvPercent(2, null)).toBeNull();
    expect(clvPercent(2, 1)).toBeNull();
  });
});

describe("isSettled", () => {
  it("pendente não está liquidada", () => {
    expect(isSettled("pendente")).toBe(false);
  });
  it("demais status estão liquidados", () => {
    for (const s of ["green", "red", "void", "half_green", "half_red", "cashout"] as const) {
      expect(isSettled(s)).toBe(true);
    }
  });
});

describe("isWinLikeForHitRate", () => {
  it("green / half_green / cashout = win", () => {
    expect(isWinLikeForHitRate("green")).toBe("win");
    expect(isWinLikeForHitRate("half_green")).toBe("win");
    expect(isWinLikeForHitRate("cashout")).toBe("win");
  });
  it("red / half_red = loss", () => {
    expect(isWinLikeForHitRate("red")).toBe("loss");
    expect(isWinLikeForHitRate("half_red")).toBe("loss");
  });
  it("void / pendente = skip", () => {
    expect(isWinLikeForHitRate("void")).toBe("skip");
    expect(isWinLikeForHitRate("pendente")).toBe("skip");
  });
});

describe("recomputeBetDerived", () => {
  it("recalcula todos os campos para uma aposta green com prob estimada", () => {
    const d = recomputeBetDerived({
      status: "green",
      odds: 2,
      stake_amount: 100,
      closing_odds: 1.8,
      estimated_probability: 60,
      bankroll: 1000,
      kelly_fraction_setting: 0.25,
    });
    expect(d.net_profit).toBe(100);
    expect(d.gross_return).toBe(200);
    expect(d.implied_probability).toBe(50);
    expect(d.edge).toBeCloseTo(10, 6);
    expect(d.ev).toBeCloseTo(20, 6);
    expect(d.kelly_fraction).toBeCloseTo(0.2, 6);
    expect(d.recommended_stake).toBeCloseTo(50, 6);
    expect(d.clv).toBeCloseTo(11.111, 3);
  });

  it("sem prob estimada deixa edge/ev/kelly/recommended nulos", () => {
    const d = recomputeBetDerived({
      status: "red",
      odds: 1.5,
      stake_amount: 50,
    });
    expect(d.net_profit).toBe(-50);
    expect(d.edge).toBeNull();
    expect(d.ev).toBeNull();
    expect(d.kelly_fraction).toBeNull();
    expect(d.recommended_stake).toBeNull();
    expect(d.clv).toBeNull();
  });

  it("usa gross_return como retorno de cashout", () => {
    const d = recomputeBetDerived({
      status: "cashout",
      odds: 2,
      stake_amount: 100,
      gross_return: 130,
    });
    expect(d.net_profit).toBe(30);
    expect(d.gross_return).toBe(130);
  });
});
