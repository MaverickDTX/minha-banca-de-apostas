import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { __resetMatchstatBreaker, matchesTennisQuery, searchTennisMatches } from "./tennis";

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

describe("searchTennisMatches", () => {
  beforeEach(() => {
    invoke.mockReset();
    __resetMatchstatBreaker(); // estado de modulo persiste entre casos
  });

  // allowFlashscore:true simula a busca PRIMARIA de tenis (unica que aciona o fallback).
  const run = (query: string) => searchTennisMatches(query, undefined, { allowFlashscore: true });

  // Resposta do primario (Matchstat) simulando cota estourada (429).
  const quotaError = () => ({ data: { ok: false, status: 429, body: null }, error: null });
  // Falha generica do invoke (ex.: timeout da edge function).
  const invokeError = () => ({ data: null, error: new Error("timeout") });

  // Pagina do Matchstat com um fixture do confronto Jade x Aubriot.
  const matchstatPage = () => ({
    data: {
      ok: true,
      status: 200,
      body: {
        data: [
          {
            id: 111,
            date: "2026-07-20T14:00:00",
            player1: { id: 1, name: "Daniel Jade" },
            player2: { id: 2, name: "Alexandre Aubriot" },
          },
        ],
        hasNextPage: false,
      },
    },
    error: null,
  });
  // Pagina vazia (tour sem jogos na janela).
  const emptyPage = () => ({ data: { ok: true, status: 200, body: { data: [], hasNextPage: false } }, error: null });

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

  it("um unico 429 arma o breaker: NENHUMA outra chamada ao primario, cai no Flashscore", async () => {
    // 1 chamada do primario (ATP recent, 429) e a cascata inteira para —
    // sem retries, sem WTA/ITF, sem janela upcoming. Depois so Flashscore.
    invoke
      .mockImplementationOnce(quotaError) // ATP recent p.1 -> 429, breaker arma
      .mockImplementationOnce(fsSearch)   // flashscore search
      .mockImplementationOnce(fsResults)  // flashscore results
      .mockImplementationOnce(fsResults); // flashscore fixtures (mesmo shape)

    const res = await run("Daniel Jade x Alexandre Aubriot");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].name).toBe("Jade D. x Aubriot A.");
    expect(res[0].league).toBe("ITF");
    // 1 primario + 3 flashscore. Regressao aqui = retry/cascata queimando cota.
    expect(invoke).toHaveBeenCalledTimes(4);
  });

  it("com breaker armado, busca seguinte vai direto ao Flashscore (zero chamadas ao primario)", async () => {
    invoke
      .mockImplementationOnce(quotaError)
      .mockImplementationOnce(fsSearch)
      .mockImplementationOnce(fsResults)
      .mockImplementationOnce(fsResults);
    await run("Daniel Jade x Alexandre Aubriot");
    invoke.mockClear();

    invoke
      .mockImplementationOnce(fsSearch)
      .mockImplementationOnce(fsResults)
      .mockImplementationOnce(fsResults);
    const res = await run("Daniel Jade x Alexandre Aubriot");
    expect(res.length).toBeGreaterThan(0);
    const bodies = invoke.mock.calls.map(([, opts]) => opts?.body);
    expect(bodies.every((b: { provider?: string }) => b?.provider === "flashscore")).toBe(true);
  });

  it("com breaker armado e allowFlashscore=false (fonte secundaria), retorna vazio sem nenhuma request", async () => {
    invoke.mockImplementationOnce(quotaError).mockImplementation(fsSearch);
    await run("Daniel Jade x Alexandre Aubriot"); // arma o breaker
    invoke.mockClear();

    const res = await searchTennisMatches("Daniel Jade", undefined);
    expect(res).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("falha nao-429 (timeout do invoke) tambem aciona o fallback Flashscore", async () => {
    // recent: ATP falha por timeout -> tour incompleto; WTA/ITF vazios;
    // upcoming: 3 tours vazios; janela recent incompleta -> fallback dispara.
    invoke
      .mockImplementationOnce(invokeError) // ATP recent (timeout)
      .mockImplementationOnce(emptyPage)   // WTA recent
      .mockImplementationOnce(emptyPage)   // ITF recent
      .mockImplementationOnce(emptyPage)   // ATP upcoming
      .mockImplementationOnce(emptyPage)   // WTA upcoming
      .mockImplementationOnce(emptyPage)   // ITF upcoming
      .mockImplementationOnce(fsSearch)
      .mockImplementationOnce(fsResults)
      .mockImplementationOnce(fsResults);

    const res = await run("Daniel Jade x Alexandre Aubriot");
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].league).toBe("ITF");
  });

  it("carga completa e vazia NAO gasta cota do Flashscore", async () => {
    for (let i = 0; i < 6; i++) invoke.mockImplementationOnce(emptyPage);
    const res = await run("Daniel Jade x Alexandre Aubriot");
    expect(res).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(6); // nenhuma chamada flashscore
  });

  it("cache da janela: segunda busca na mesma janela nao refaz requests do primario", async () => {
    // Regressao do bug do commit 2737750: o cache guardava IndexedEvent[] mas o
    // consumidor esperava { events, complete } -> TypeError no segundo keystroke.
    invoke
      .mockImplementationOnce(matchstatPage) // ATP recent (traz o confronto)
      .mockImplementationOnce(emptyPage)     // WTA recent
      .mockImplementationOnce(emptyPage);    // ITF recent
    const first = await run("Daniel Jade");
    expect(first.length).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(3);

    invoke.mockClear();
    const second = await run("Daniel Jade x Alexandre Aubriot"); // mesma janela, cache hit
    expect(second.length).toBe(1);
    expect(second[0].name).toBe("Daniel Jade x Alexandre Aubriot");
    expect(invoke).not.toHaveBeenCalled();
  });
});
