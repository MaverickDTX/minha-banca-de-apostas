import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import {
  __resetMatchstatBreaker,
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
    __resetMatchstatBreaker();
    __resetTennisIndex();
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

  it("filtra doubles do índice", async () => {
    invoke
      .mockResolvedValueOnce(board([match(1, "Player A/Player B", "Player C/Player D")]))
      .mockResolvedValueOnce(emptyFixtures())
      .mockResolvedValueOnce(emptyFixtures());

    expect((await loadTennisIndex()).events).toEqual([]);
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
