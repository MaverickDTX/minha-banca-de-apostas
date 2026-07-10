import type { AnalyticsPreset } from "@/lib/analyticsUrl";

/** Rótulos curtos dos dias da semana (índice 0 = domingo, alinhado a Date.getDay()). */
export const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/**
 * Presets de intervalo de tempo usados nos seletores de gráfico (Dashboard e Análises).
 * `key` casa com AnalyticsPreset (deep-link na URL de Análises); Dashboard usa só `days`/`label`.
 * `days: null` = "Tudo" (sem recorte temporal).
 */
export const RANGE_PRESETS: ReadonlyArray<{
  key: AnalyticsPreset;
  days: number | null;
  label: string;
}> = [
  { key: "7", days: 7, label: "7d" },
  { key: "14", days: 14, label: "14d" },
  { key: "30", days: 30, label: "30d" },
  { key: "90", days: 90, label: "90d" },
  { key: "all", days: null, label: "Tudo" },
];
