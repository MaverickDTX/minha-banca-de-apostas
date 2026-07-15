import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { __resetMatchstatBreaker, matchesTennisQuery, searchTennisMatches, tennisQuotaLimited } from "./tennis";

describe("matchesTennisQuery", () => {
  const jadeVsAubriot = "daniel jade alexandre aubriot";

  it("encontra confronto digitado com vs", () => {
    expect(matchesTennisQuery(jadeVsAubriot, "Daniel Jade vs Alexandre Aubriot")).toBe(true);
  });

  it("aceita x como separador de confronto", () => {
    expect(matchesTennisQuery(jadeVsAubriot, "Daniel Jade x Alexandre Aubriot")).toBe(true);
  });

  it.each(["Daniel Jade", "Alexandre Aubriot"])("encontra jogador isolado: %s", (query) => {
    expect(matchesTennisQuery(jadeVsAubriot, query)).toBe(true);
  });

  it("exige os dois jogadores do confronto", () => {
    expect(matchesTennisQuery(jadeVsAubriot, "Daniel Jade vs Outro Jogador")).toBe(false);
  });
});

describe("searchTennisMatches fallback Flashscore", () => {
  beforeEach(() => {
    invoke.mockReset();
    tennisQuotaLimited.value = false;
    __resetMatchstatBreaker(); // estado de modulo persiste entre casos
    // Fake timers: os retries de 429 usam setTimeout (wait). Sem timers falsos
    // cada teste espera ~9s reais; com eles adiantamos o relogio e roda em ms.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // allowFlashscore:true simula a busca PRIMARIA de tenis (unica que aciona o fallback).
  const runWithTimers = async (query: string) => {
    const promise = searchTennisMatches(query, undefined, { allowFlashscore: true });
    await vi.runAllTimersAsync();
    return promise;
  };

  // Resposta do primario (Matchstat) simulando cota estourada (429).
  const quotaError = () => ({ data: { ok: false, status: 429, body: null }, error: null });

  // Resposta do Flashscore: search acha o jogador, results traz o confronto Jade x Aubriot.
  const fsSearch = () => ({
    data: {
      ok: true,
      status: 200,
      body: [{ id: "ABqFnqUJ", type: "player", name: "Jade Daniel", sport: { id: 2, name: "Tennis" } }],
    },
    error: null,
  });
  const fsResults = () => ({
    data: {
      ok: true,
      status: 200,
      body: [
        {
          tournament_url: "/tennis/itf-men-singles/m25-uriage/",
          matches: [
            {
              match_id: "MaL6NIv0",
              timestamp: 1784097000,
              home_team: { player_id: "ABqFnqUJ", name: "Jade D." },
              away_team: { player_id: "IB6rAbr3", name: "Aubriot A." },
            },
          ],
        },
      ],
    },
    error: null,
  });

  it("cai no Flashscore quando o primario volta 429 e acha o confronto", async () => {
    // 6 tours (recent+upcoming) x ate 3 tentativas cada = 18 chamadas do primario,
    // todas 429. Depois vem search + results + fixtures do Flashscore (once FIFO).
    for (let i = 0; i < 18; i++) invoke.mockImplementationOnce(quotaError);
    invoke
      .mockImplementationOnce(fsSearch) // flashscore search
      .mockImplementationOnce(fsResults) // flashscore results
      .mockImplementationOnce(fsResults); // flashscore fixtures (mesmo shape)

    const res = await runWithTimers("Daniel Jade x Alexandre Aubriot");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].name).toBe("Jade D. x Aubriot A.");
    expect(res[0].league).toBe("ITF");
    expect(tennisQuotaLimited.value).toBe(false);
  });

  it("marca quota limitada quando primario 429 e Flashscore tambem falha", async () => {
    for (let i = 0; i < 18; i++) invoke.mockImplementationOnce(quotaError);
    invoke.mockImplementationOnce(() => ({ data: { ok: true, status: 200, body: [] }, error: null })); // search vazio

    const res = await runWithTimers("Daniel Jade x Alexandre Aubriot");
    expect(res).toEqual([]);
    expect(tennisQuotaLimited.value).toBe(true);
  });
});
