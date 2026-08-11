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
  calibratedStreakThreshold,
  chasingInsight,
  selectionMargin,
  DOWNTURN_FAMILY,
  MIN_GROUP_BETS,
  MIN_CLV_BETS,
  RED_STREAK_MIN,
  RED_STREAK_MAX,
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

/** Sequência cronológica: o último item da lista é a aposta mais recente. */
function seq(results: ("green" | "red")[], startDaysAgo = 250): Bet[] {
  return results.map((r, i) =>
    makeBet({
      status: r,
      odds: 2,
      stake_amount: 100,
      net_profit: r === "green" ? 100 : -100,
      bet_date: daysAgo(startDaysAgo - i),
    }),
  );
}

const fill = (n: number, r: "green" | "red") => Array<"green" | "red">(n).fill(r);

/** Grupo com `greens` vitórias e `reds` derrotas em odds 2,0, stake fixo. */
function group(
  field: "market" | "bookmaker",
  key: string,
  greens: number,
  reds: number,
  startDaysAgo: number,
): Bet[] {
  const out: Bet[] = [];
  let d = startDaysAgo;
  const add = (status: "green" | "red") =>
    out.push(
      makeBet({
        status,
        odds: 2,
        stake_amount: 100,
        net_profit: status === "green" ? 100 : -100,
        bet_date: daysAgo(d--),
        [field]: key,
      } as never),
    );
  for (let i = 0; i < greens; i++) add("green");
  for (let i = 0; i < reds; i++) add("red");
  return out;
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

describe("selectionMargin", () => {
  it("cresce com o número de grupos comparados", () => {
    expect(selectionMargin(2)).toBeCloseTo(Math.sqrt(2 * Math.LN2), 6);
    expect(selectionMargin(8)).toBeGreaterThan(selectionMargin(4));
    expect(selectionMargin(4)).toBeGreaterThan(selectionMargin(2));
  });
  it("k < 2 não zera a margem", () => {
    expect(selectionMargin(1)).toBe(selectionMargin(2));
    expect(selectionMargin(0)).toBeGreaterThan(0);
  });
});

describe("correção de winner's curse nas regras de grupo", () => {
  it("melhor mercado indistinguível de ruído → info, não superlativo", () => {
    // 4 mercados, 30 apostas cada, taxas praticamente iguais. O líder tem
    // +13,3 p.p. contra o resto — bem abaixo da margem de seleção (~35 p.p.).
    // Com o MIN_GROUP_BETS=10 antigo isso virava "seu mercado mais lucrativo".
    const bets = [
      ...group("market", "Over 2.5", 17, 13, 250),
      ...group("market", "Handicap", 15, 15, 200),
      ...group("market", "Ambas marcam", 15, 15, 150),
      ...group("market", "Escanteios", 14, 16, 100),
    ];
    const i = bestMarketInsight(bets);
    expect(i?.severity).toBe("info");
    expect(i?.text).toContain("dentro do que a variância explica");
    expect(i?.text).not.toContain("melhor mercado");
  });

  it("vantagem grande o bastante ainda é afirmada como positive", () => {
    // 75% de acerto em odds 2,0 contra 50% no resto: +50 p.p., muito acima
    // da margem (~22 p.p.). A correção não é um silenciador geral.
    const bets = [
      ...group("market", "Value", 45, 15, 250),
      ...group("market", "Handicap", 30, 30, 180),
      ...group("market", "Ambas marcam", 30, 30, 110),
      ...group("market", "Escanteios", 30, 30, 40),
    ];
    const i = bestMarketInsight(bets);
    expect(i?.severity).toBe("positive");
    expect(i?.text).toContain("variância não explica");
  });

  it("o mesmo líder deixa de ser afirmado quando há mais mercados na disputa", () => {
    // Líder idêntico nos dois cenários (+33,3 p.p.); muda só quantos mercados
    // entram na comparação. Com 2, a margem é ~24 p.p. e o líder passa; com 12,
    // sobe para ~40 p.p. e o mesmo dado deixa de sustentar o superlativo.
    const leader = group("market", "Over 2.5", 20, 10, 900);
    const filler = (n: number) =>
      Array.from({ length: n }, (_, i) => group("market", `Mercado ${i}`, 50, 50, 800 - i * 60)).flat();

    expect(bestMarketInsight([...leader, ...filler(1)])?.severity).toBe("positive");
    expect(bestMarketInsight([...leader, ...filler(11)])?.severity).toBe("info");
  });

  it("pior mercado indistinguível também degrada para info", () => {
    const bets = [
      ...group("market", "Escanteios", 13, 17, 250),
      ...group("market", "Handicap", 15, 15, 200),
      ...group("market", "Ambas marcam", 15, 15, 150),
      ...group("market", "Over 2.5", 16, 14, 100),
    ];
    const i = worstMarketInsight(bets);
    expect(i?.severity).toBe("info");
  });

  it("CLV passa no mesmo teste com n bem menor — variância genuinamente baixa", () => {
    // CLV independe do resultado: série pouco volátil. 10 apostas bastam,
    // enquanto 10 apostas jamais sustentariam uma afirmação sobre yield.
    const spread = [1.8, 2.4, 3.1, 2.0, 2.9, 2.2, 3.4, 1.9, 2.6, 2.7];
    const bets = spread.map((clv, i) =>
      makeBet({
        status: "green",
        odds: 2,
        stake_amount: 100,
        net_profit: 100,
        bet_date: daysAgo(200 - i),
        sport: "Futebol",
        clv,
      }),
    );
    const i = clvBySportInsight(bets);
    expect(i?.severity).toBe("positive");
  });

  it("CLV disperso demais em torno de zero não afirma nada", () => {
    const spread = [8, -7, 6, -9, 5, -4, 7, -8, 3, -1];
    const bets = spread.map((clv, i) =>
      makeBet({
        status: "green",
        odds: 2,
        stake_amount: 100,
        net_profit: 100,
        bet_date: daysAgo(200 - i),
        sport: "Futebol",
        clv,
      }),
    );
    expect(clvBySportInsight(bets)).toBeNull();
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
  it("amostra pequena usa o piso e não afirma probabilidade", () => {
    const bets = seq(["green", "red", "red", "red"]);
    const i = redStreakInsight(bets);
    expect(i?.severity).toBe("warning");
    expect(i?.text).not.toContain("Pelo seu histórico");
  });
});

describe("calibratedStreakThreshold", () => {
  it("odds ~2.0 (q=0,55) exige 6 reds — 0,55^5 ainda passa de 5%", () => {
    expect(calibratedStreakThreshold(0.55)).toBe(6);
    expect(Math.pow(0.55, 5)).toBeGreaterThan(0.05);
    expect(Math.pow(0.55, 6)).toBeLessThan(0.05);
  });
  it("favoritos (q=0,25) cai no piso de 3", () => {
    expect(calibratedStreakThreshold(0.25)).toBe(RED_STREAK_MIN);
  });
  it("q muito alto satura no teto", () => {
    expect(calibratedStreakThreshold(0.9)).toBe(RED_STREAK_MAX);
  });
  it("extremos degeneram sem estourar", () => {
    expect(calibratedStreakThreshold(0)).toBe(RED_STREAK_MAX);
    expect(calibratedStreakThreshold(1)).toBe(RED_STREAK_MIN);
  });
});

describe("redStreakInsight calibrado", () => {
  // q = 0,55 → limiar 6. Sob o antigo fixo de 3, ambos os casos alertariam.
  it("5 reds num perfil q=0,55 → silêncio (era falso positivo antes)", () => {
    const bets = seq([...fill(28, "red"), ...fill(27, "green"), ...fill(5, "red")]);
    expect(redStreakInsight(bets)).toBeNull();
  });
  it("6 reds no mesmo perfil → alerta com a probabilidade do histórico", () => {
    const bets = seq([...fill(27, "red"), ...fill(27, "green"), ...fill(6, "red")]);
    const i = redStreakInsight(bets);
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("6 derrotas");
    expect(i?.text).toContain("55%");
  });
  it("perfil de favoritos alerta já em 3 reds", () => {
    const bets = seq([...fill(9, "red"), ...fill(30, "green"), ...fill(3, "red")]);
    const i = redStreakInsight(bets);
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("3 derrotas");
  });
});

describe("chasingInsight", () => {
  /** 12 apostas de aquecimento a 100 + N blocos [red, red, aposta de teste]. */
  function blocks(n: number, chaseStake: number, warmupStake = 100): Bet[] {
    const out: Bet[] = [];
    let day = 250;
    const push = (status: "green" | "red", stake: number) => {
      out.push(
        makeBet({
          status,
          odds: 2,
          stake_amount: stake,
          net_profit: status === "green" ? stake : -stake,
          bet_date: daysAgo(day--),
        }),
      );
    };
    for (let i = 0; i < 12; i++) push("green", warmupStake);
    for (let i = 0; i < n; i++) {
      push("red", warmupStake);
      push("red", warmupStake);
      push("green", chaseStake);
    }
    return out;
  }

  it("stake sobe após derrotas → warning citando Kelly", () => {
    const i = chasingInsight(blocks(8, 150));
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("50%");
    expect(i?.text).toContain("Kelly");
  });

  it("stake estável → null", () => {
    expect(chasingInsight(blocks(8, 100))).toBeNull();
  });

  it("stake cai após derrotas → positive", () => {
    const i = chasingInsight(blocks(8, 60));
    expect(i?.severity).toBe("positive");
    expect(i?.text).toContain("reduz a stake");
  });

  it("null abaixo da amostra mínima de ocorrências", () => {
    expect(chasingInsight(blocks(3, 200))).toBeNull();
  });

  it("não confunde crescimento de banca com chasing", () => {
    // Regime de stake 100 → regime de stake 300, sem chasing dentro de cada um.
    // Uma média GLOBAL acusaria chasing; a mediana local absorve o degrau.
    const out: Bet[] = [];
    let day = 250;
    const push = (status: "green" | "red", stake: number) =>
      out.push(
        makeBet({
          status,
          odds: 2,
          stake_amount: stake,
          net_profit: status === "green" ? stake : -stake,
          bet_date: daysAgo(day--),
        }),
      );
    for (let i = 0; i < 20; i++) push("green", 100);
    for (let i = 0; i < 8; i++) {
      push("red", 300);
      push("red", 300);
      push("green", 300);
    }
    expect(chasingInsight(out)).toBeNull();
  });

  it("ignora freebets no cálculo da razão", () => {
    const withFree = blocks(8, 150).map((b) =>
      Number(b.stake_amount) === 150 ? makeBet({ ...b, is_free_bet: true } as never) : b,
    );
    expect(chasingInsight(withFree)).toBeNull();
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
  it("no fundo do próprio recorde → diz que ATINGIU, não que está próximo", () => {
    // Regressão do bug original: o pior drawdown É o estado atual. A frase
    // "próximo do seu pior histórico" era factualmente errada aqui.
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(120) }),
      makeBet({ status: "red", odds: 2, stake_amount: 900, net_profit: -900, bet_date: daysAgo(20) }),
    ];
    const i = drawdownInsight(bets, { now: NOW });
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("maior drawdown da sua história");
    expect(i?.text).not.toContain("próximo");
  });

  it("recorde recente parcialmente recuperado → reporta a fração recuperada", () => {
    // Pico 1000 → fundo 100 (dd -900) → recupera 200 (dd corrente -700 = 78% recuperado? não: 22%).
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(60) }),
      makeBet({ status: "red", odds: 2, stake_amount: 900, net_profit: -900, bet_date: daysAgo(20) }),
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 200, bet_date: daysAgo(3) }),
    ];
    const i = drawdownInsight(bets, { now: NOW });
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("já recuperou");
    expect(i?.text).toContain("22%");
  });

  it("submerso perto do recorde sem ser recorde → alerta de proximidade", () => {
    // Pior dd histórico -1000; posição atual -900 (90% dele, acima do ratio 0,8).
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(300) }),
      makeBet({ status: "red", odds: 2, stake_amount: 1000, net_profit: -1000, bet_date: daysAgo(250) }),
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 100, bet_date: daysAgo(200) }),
    ];
    const i = drawdownInsight(bets, { now: NOW });
    expect(i?.severity).toBe("warning");
    expect(i?.text).toContain("abaixo do seu topo");
    expect(i?.text).toContain("90%");
  });

  it("null quando a curva voltou ao topo", () => {
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(120) }),
      makeBet({ status: "red", odds: 2, stake_amount: 500, net_profit: -500, bet_date: daysAgo(60) }),
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 600, bet_date: daysAgo(5) }),
    ];
    expect(drawdownInsight(bets, { now: NOW })).toBeNull();
  });

  it("null quando a posição atual está longe do pior histórico", () => {
    // Pior dd -1000, posição atual -100 (10% dele) e recorde antigo → silêncio.
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(300) }),
      makeBet({ status: "red", odds: 2, stake_amount: 1000, net_profit: -1000, bet_date: daysAgo(250) }),
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 900, bet_date: daysAgo(200) }),
    ];
    expect(drawdownInsight(bets, { now: NOW })).toBeNull();
  });

  it("conta o drawdown na curva REAL, não numa janela reiniciada", () => {
    // A janela de 30d contém só uma red pequena (-50), mas a curva já entrou
    // nela submersa em -950. A regra antiga media -50 e silenciava.
    const bets = [
      makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 1000, bet_date: daysAgo(300) }),
      makeBet({ status: "red", odds: 2, stake_amount: 950, net_profit: -950, bet_date: daysAgo(200) }),
      makeBet({ status: "red", odds: 2, stake_amount: 50, net_profit: -50, bet_date: daysAgo(5) }),
    ];
    const i = drawdownInsight(bets, { now: NOW });
    expect(i?.severity).toBe("warning");
  });

  it("null sem drawdown histórico", () => {
    const bets = repeat(5, { status: "green", odds: 2, stake_amount: 100, net_profit: 100 });
    expect(drawdownInsight(bets, { now: NOW })).toBeNull();
  });
});

describe("computeInsights", () => {
  it("ordena warnings antes de positives e filtra nulls", () => {
    // Datas explícitas por daysAgo: derivá-las de MIN_GROUP_BETS fazia os
    // greens avançarem sobre os reds quando a constante mudava.
    const bets = [
      // Mercado lucrativo (positive)...
      ...group("market", "Over 2.5", MIN_GROUP_BETS, 0, 250),
      // ...seguido de 3 reds genuinamente no fim (warning).
      ...group("market", "Handicap", 0, 3, 10),
    ];
    const insights = computeInsights(bets, { now: NOW });
    expect(insights.length).toBeGreaterThanOrEqual(2);
    const firstPositive = insights.findIndex((i) => i.severity === "positive");
    const lastWarning = insights.map((i) => i.severity).lastIndexOf("warning");
    expect(lastWarning).toBeLessThan(firstPositive);
    expect(insights.some((i) => i.id === "best-market")).toBe(true);
  });

  it("mantém só um warning da família de momento ruim", () => {
    // Cenário que antes empilhava drawdown + red-streak + yield-trend:
    // fase boa antiga, fase ruim recente com 3 reds no fim.
    const bets = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 100, bet_date: daysAgo(50 + i) }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: daysAgo(10 - i) }),
      ),
    ];
    const insights = computeInsights(bets, { now: NOW });
    const downturn = insights.filter((i) =>
      DOWNTURN_FAMILY.includes(i.id as (typeof DOWNTURN_FAMILY)[number]) && i.severity === "warning",
    );
    expect(downturn).toHaveLength(1);
    // Prioridade: drawdown vence red-streak e yield-trend.
    expect(downturn[0].id).toBe("drawdown");
  });

  it("não suprime yield-trend quando ele é positivo", () => {
    // Fase ruim antiga → fase boa recente: yield subiu e a curva voltou ao topo.
    const bets = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeBet({ status: "red", odds: 2, stake_amount: 100, net_profit: -100, bet_date: daysAgo(50 + i) }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeBet({ status: "green", odds: 2, stake_amount: 100, net_profit: 200, bet_date: daysAgo(10 - i) }),
      ),
    ];
    const insights = computeInsights(bets, { now: NOW });
    const yt = insights.find((i) => i.id === "yield-trend");
    expect(yt?.severity).toBe("positive");
  });

  it("lista vazia → sem insights", () => {
    expect(computeInsights([], { now: NOW })).toEqual([]);
  });
});
