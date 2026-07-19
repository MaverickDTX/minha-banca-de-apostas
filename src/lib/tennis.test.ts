import { beforeEach, describe, expect, it, vi } from "vitest";

// dbSelect: terminal (.limit) de TODA query ao Postgres mockado. A 1ª chamada de
// searchTennisMatches é sempre a checagem de frescor do cache persistido
// (tennisDbUsable); a 2ª, quando o cache é usável, é a busca por nome.
const { invoke, dbSelect } = vi.hoisted(() => ({ invoke: vi.fn(), dbSelect: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "ilike", "order"]) q[m] = vi.fn(() => q);
    q.limit = vi.fn(() => Promise.resolve(dbSelect()));
    return q;
  };
  return { supabase: { functions: { invoke }, from: vi.fn(builder) } };
});

import {
  __resetMatchstatBreaker,
  __resetTennisDbCache,
  __resetTennisIndex,
  loadTennisIndex,
  matchesTennisQuery,
  searchTennisMatches,
} from "./tennis";

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

describe("índice de tênis", () => {
  beforeEach(() => {
    invoke.mockReset();
    dbSelect.mockReset();
    // Default: tabela do cache persistido vazia → frescor reprova → caminho
    // legado (edge function), que é o que estes casos exercitam.
    dbSelect.mockReturnValue({ data: [], error: null });
    __resetMatchstatBreaker();
    __resetTennisIndex();
    __resetTennisDbCache();
  });

  const board = (matches: unknown[], total = matches.length) => ({
    data: { ok: true, status: 200, body: { total, matches } },
    error: null,
  });
  const fixtures = (data: unknown[]) => ({
    data: { ok: true, status: 200, body: { data, hasNextPage: false } },
    error: null,
  });
  const match = (id: number, p1 = "Daniel Jade", p2 = "Alexandre Aubriot") => ({
    id,
    date: "2026-07-20T14:00:00Z",
    type: "atp",
    tournament: { name: "Open Test" },
    player1: { id: id * 2, name: p1 },
    player2: { id: id * 2 + 1, name: p2 },
  });
  const emptyFixtures = () => fixtures([]);

  it("carrega board de uma página e histórico em duas chamadas", async () => {
    invoke
      .mockResolvedValueOnce(board([match(1)]))
      .mockResolvedValueOnce(emptyFixtures())
      .mockResolvedValueOnce(emptyFixtures());

    const result = await loadTennisIndex();
    expect(result.complete).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls[0][1].body.path).toBe("/tennis/v2/ms-api/upcoming/matches?limit=500&page=1");
  });

  it("pagina board saturado", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => match(index + 1));
    invoke
      .mockResolvedValueOnce(board(firstPage, 501))
      .mockResolvedValueOnce(board([match(1001)], 501))
      .mockResolvedValueOnce(emptyFixtures())
      .mockResolvedValueOnce(emptyFixtures());

    const result = await loadTennisIndex();
    expect(result.events).toHaveLength(501);
    expect(invoke.mock.calls[1][1].body.path).toContain("page=2");
  });

  it("inclui doubles no índice, buscável por parceiro individual", async () => {
    invoke
      .mockResolvedValueOnce(board([match(1, "Player A/Player B", "Player C/Player D")]))
      .mockResolvedValueOnce(emptyFixtures())
      .mockResolvedValueOnce(emptyFixtures());

    const result = await loadTennisIndex();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe("Player A/Player B x Player C/Player D");
    // "/" vira espaço no _hay: busca por um único parceiro casa por substring.
    expect(matchesTennisQuery(result.events[0]._hay, "Player C")).toBe(true);
  });

  it("deduplica o mesmo confronto entre board e histórico", async () => {
    const shared = match(1);
    invoke
      .mockResolvedValueOnce(board([shared]))
      .mockResolvedValueOnce(fixtures([shared]))
      .mockResolvedValueOnce(emptyFixtures());

    expect((await loadTennisIndex()).events).toHaveLength(1);
  });

  it("faz cache-hit na segunda busca", async () => {
    invoke
      .mockResolvedValueOnce(board([match(1)]))
      .mockResolvedValueOnce(emptyFixtures())
      .mockResolvedValueOnce(emptyFixtures());

    expect((await searchTennisMatches("Daniel Jade")).length).toBe(1);
    invoke.mockClear();
    expect((await searchTennisMatches("Alexandre Aubriot")).length).toBe(1);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("429 no board marca carga incompleta e aciona fallback", async () => {
    invoke
      .mockResolvedValueOnce({ data: { ok: false, status: 429, body: null }, error: null })
      .mockResolvedValueOnce(emptyFixtures())
      .mockResolvedValueOnce(emptyFixtures())
      .mockResolvedValue({ data: { ok: true, status: 200, body: [] }, error: null });

    const result = await searchTennisMatches("Daniel Jade", undefined, { allowFlashscore: true });
    expect(result).toEqual([]);
    expect(invoke.mock.calls[0][1].body.path).toContain("ms-api/upcoming");
  });
});

describe("cache persistido (fase 2 — tabela populada pelo cron)", () => {
  beforeEach(() => {
    invoke.mockReset();
    dbSelect.mockReset();
    __resetMatchstatBreaker();
    __resetTennisIndex();
    __resetTennisDbCache();
  });

  const freshMeta = () => ({ data: [{ refreshed_at: new Date().toISOString() }], error: null });
  const staleMeta = () => ({
    data: [{ refreshed_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString() }],
    error: null,
  });
  const dbRow = (id: number, p1 = "Daniel Jade", p2 = "Alexandre Aubriot") => ({
    match_id: id,
    tour: "atp",
    starts_at: "2026-07-20T14:00:00Z",
    player1_name: p1,
    player2_name: p2,
  });

  it("resolve busca no Postgres sem tocar a edge function", async () => {
    dbSelect
      .mockReturnValueOnce(freshMeta())               // tennisDbUsable
      .mockReturnValueOnce({ data: [dbRow(7)], error: null }); // searchTennisDb

    const result = await searchTennisMatches("Daniel Jade");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tennis-atp-7");
    expect(result[0].name).toBe("Daniel Jade x Alexandre Aubriot");
    expect(invoke).not.toHaveBeenCalled(); // zero cota externa no hot path
  });

  it("vazio com cache fresco é resultado legítimo — não cai no legado", async () => {
    dbSelect
      .mockReturnValueOnce(freshMeta())
      .mockReturnValueOnce({ data: [], error: null });

    const result = await searchTennisMatches("Jogador Inexistente");
    expect(result).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("cache stale (>24h) cai no caminho legado da edge function", async () => {
    dbSelect.mockReturnValue(staleMeta());
    invoke
      .mockResolvedValueOnce({ data: { ok: true, status: 200, body: { total: 0, matches: [] } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 200, body: { data: [], hasNextPage: false } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 200, body: { data: [], hasNextPage: false } }, error: null });

    const result = await searchTennisMatches("Daniel Jade");
    expect(result).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(3); // board + atp + wta (fase 1 intacta)
  });

  it("falha de leitura do Postgres cai no legado (null ≠ vazio)", async () => {
    dbSelect
      .mockReturnValueOnce(freshMeta())
      .mockReturnValueOnce({ data: null, error: { message: "boom" } })
      .mockReturnValue({ data: [], error: null });
    invoke
      .mockResolvedValueOnce({ data: { ok: true, status: 200, body: { total: 0, matches: [] } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 200, body: { data: [], hasNextPage: false } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, status: 200, body: { data: [], hasNextPage: false } }, error: null });

    const result = await searchTennisMatches("Daniel Jade");
    expect(result).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});
