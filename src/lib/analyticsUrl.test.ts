import { describe, expect, it } from "vitest";
import type { Bet } from "@/hooks/useBets";
import {
  betMatchesGroup,
  buildAnalyticsUrl,
  currentMonthRange,
  getBetGroupKey,
  parseAnalyticsTab,
  presetStartDate,
} from "./analyticsUrl";

const baseBet = {
  id: "1",
  user_id: "u",
  bet_date: "2026-06-15T12:00:00Z",
  event_name: "A x B",
  sport: "Futebol",
  league: "Brasileirão",
  market: "Over 2.5",
  bookmaker: "Bet365",
  bet_type: "simples",
  timing: "pre-live",
  odds: 2.1,
  closing_odds: null,
  stake_amount: 100,
  status: "green",
  net_profit: 110,
  gross_return: 210,
  estimated_probability: null,
  tipster: null,
  tags: ["value"],
  notes: null,
  is_free_bet: false,
  created_at: "2026-06-15T12:00:00Z",
  updated_at: "2026-06-15T12:00:00Z",
} satisfies Bet;

describe("buildAnalyticsUrl", () => {
  it("retorna /analises sem params vazios", () => {
    expect(buildAnalyticsUrl()).toBe("/analises");
    expect(buildAnalyticsUrl({ preset: "all" })).toBe("/analises");
    expect(buildAnalyticsUrl({ status: "all" })).toBe("/analises");
  });

  it("monta query com tab, group, status e datas", () => {
    const url = buildAnalyticsUrl({
      preset: "30",
      start: "2026-05-01",
      end: "2026-06-01",
      status: "green",
      tab: "mercado",
      group: "Over 2.5",
    });
    expect(url).toContain("/analises?");
    expect(url).toContain("preset=30");
    expect(url).toContain("start=2026-05-01");
    expect(url).toContain("end=2026-06-01");
    expect(url).toContain("status=green");
    expect(url).toContain("tab=mercado");
    expect(url).toContain("group=Over+2.5");
  });
});

describe("getBetGroupKey / betMatchesGroup", () => {
  it("agrupa esporte e mercado", () => {
    expect(getBetGroupKey(baseBet, "esporte")).toBe("Futebol");
    expect(getBetGroupKey(baseBet, "mercado")).toBe("Over 2.5");
    expect(betMatchesGroup(baseBet, "esporte", "Futebol")).toBe(true);
    expect(betMatchesGroup(baseBet, "esporte", "Basquete")).toBe(false);
  });

  it("cai em — para campos vazios", () => {
    const empty = { ...baseBet, sport: "  ", league: "" };
    expect(getBetGroupKey(empty, "esporte")).toBe("—");
    expect(getBetGroupKey(empty, "liga")).toBe("—");
  });

  it("agrupa mês YYYY-MM", () => {
    expect(getBetGroupKey(baseBet, "mes")).toBe("2026-06");
    expect(betMatchesGroup(baseBet, "mes", "2026-06")).toBe(true);
  });
});

describe("parseAnalyticsTab", () => {
  it("default esporte", () => {
    expect(parseAnalyticsTab(null)).toBe("esporte");
    expect(parseAnalyticsTab("invalid")).toBe("esporte");
  });

  it("aceita tabs válidas", () => {
    expect(parseAnalyticsTab("mercado")).toBe("mercado");
    expect(parseAnalyticsTab("tipo")).toBe("tipo");
  });
});

describe("currentMonthRange / presetStartDate", () => {
  it("mês corrente completo", () => {
    const ref = new Date(2026, 6, 15); // julho
    expect(currentMonthRange(ref)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });

  it("preset 7d", () => {
    const ref = new Date(2026, 6, 15);
    expect(presetStartDate(7, ref)).toBe("2026-07-08");
  });
});
