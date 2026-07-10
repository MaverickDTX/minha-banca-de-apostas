import type { Bet } from "@/hooks/useBets";
import { oddsBucket } from "./metrics";
import { DAY_NAMES } from "./constants";

export const ANALYTICS_TABS = [
  "esporte",
  "liga",
  "mercado",
  "casa",
  "odds",
  "dia",
  "mes",
  "tag",
  "tipster",
  "timing",
  "tipo",
] as const;

export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export type AnalyticsPreset = "7" | "14" | "30" | "90" | "all";

export type AnalyticsUrlParams = {
  preset?: AnalyticsPreset;
  start?: string;
  end?: string;
  status?: string;
  tab?: AnalyticsTab;
  group?: string;
  dateRange?: "current";
  view?: "winrate";
  minStake?: number;
};

/** Chave de agrupamento alinhada com Analytics.tsx (mesma lógica das tabelas). */
export function getBetGroupKey(bet: Bet, tab: AnalyticsTab): string {
  switch (tab) {
    case "esporte":
      return (bet.sport && bet.sport.trim()) || "—";
    case "liga":
      return (bet.league && bet.league.trim()) || "—";
    case "mercado":
      return (bet.market && bet.market.trim()) || "—";
    case "casa":
      return (bet.bookmaker && bet.bookmaker.trim()) || "—";
    case "odds":
      return oddsBucket(Number(bet.odds));
    case "dia":
      return DAY_NAMES[new Date(bet.bet_date).getDay()];
    case "mes": {
      const d = new Date(bet.bet_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    case "tag":
      return bet.tags && bet.tags.length ? bet.tags[0] : "—";
    case "tipster":
      return bet.tipster ?? "—";
    case "timing":
      return bet.timing;
    case "tipo":
      return bet.bet_type;
  }
}

export function betMatchesGroup(bet: Bet, tab: AnalyticsTab, group: string): boolean {
  return getBetGroupKey(bet, tab) === group;
}

export function parseAnalyticsTab(value: string | null): AnalyticsTab {
  if (value && (ANALYTICS_TABS as readonly string[]).includes(value)) {
    return value as AnalyticsTab;
  }
  return "esporte";
}

export function analyticsTabLabel(tab: AnalyticsTab): string {
  const labels: Record<AnalyticsTab, string> = {
    esporte: "Esporte",
    liga: "Liga",
    mercado: "Mercado",
    casa: "Casa",
    odds: "Faixa de odds",
    dia: "Dia da semana",
    mes: "Mês",
    tag: "Tag",
    tipster: "Tipster",
    timing: "Pré × Live",
    tipo: "Simples × Múltiplas",
  };
  return labels[tab];
}

export function buildAnalyticsUrl(params: AnalyticsUrlParams = {}): string {
  const sp = new URLSearchParams();
  if (params.preset && params.preset !== "all") sp.set("preset", params.preset);
  if (params.start) sp.set("start", params.start);
  if (params.end) sp.set("end", params.end);
  if (params.status && params.status !== "all") sp.set("status", params.status);
  if (params.tab && params.tab !== "esporte") sp.set("tab", params.tab);
  if (params.group) sp.set("group", params.group);
  if (params.dateRange) sp.set("dateRange", params.dateRange);
  if (params.view) sp.set("view", params.view);
  if (params.minStake != null) sp.set("minStake", String(params.minStake));
  const qs = sp.toString();
  return qs ? `/analises?${qs}` : "/analises";
}

/** 1º e último dia do mês de referência (YYYY-MM-DD, fuso local). */
export function currentMonthRange(ref = new Date()): { start: string; end: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function presetStartDate(days: number, ref = new Date()): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function parseAnalyticsPreset(value: string | null): AnalyticsPreset | "" {
  if (value === "7" || value === "14" || value === "30" || value === "90" || value === "all") return value;
  return "";
}
