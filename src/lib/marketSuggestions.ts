// Suggested "Seleção" values based on the chosen market and event teams.

export type SelectionSuggestion = { label: string; group?: string };

const OU_LINES = [0.5, 1.5, 2.5, 3.5];
const AH_LINES = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];

function detectMarketType(market: string): string {
  const m = market.toLowerCase().trim();
  if (!m) return "1x2";
  if (m.includes("ambas") || m.includes("btts") || m.includes("both")) return "btts";
  if (m.includes("over") || m.includes("under") || m.includes("mais") || m.includes("menos") || m.includes("gols") || m.includes("total")) return "ou";
  if (m.includes("handicap") || m.includes("asi")) return "ah";
  if (m.includes("dupla") || m.includes("double")) return "dc";
  if (m.includes("escanteio") || m.includes("corner")) return "corners";
  if (m.includes("cart")) return "cards";
  if (m.includes("result") || m.includes("1x2") || m === "ml" || m.includes("moneyline") || m.includes("vencedor")) return "1x2";
  return "1x2";
}

export function getSelectionSuggestions(
  market: string,
  home?: string,
  away?: string,
): SelectionSuggestion[] {
  const type = detectMarketType(market);
  const H = home ?? "Mandante";
  const A = away ?? "Visitante";
  const out: SelectionSuggestion[] = [];

  switch (type) {
    case "1x2":
      out.push(
        { label: `Vitória ${H}`, group: "Resultado" },
        { label: "Empate", group: "Resultado" },
        { label: `Vitória ${A}`, group: "Resultado" },
      );
      break;
    case "dc":
      out.push(
        { label: `${H} ou empate`, group: "Dupla chance" },
        { label: `${H} ou ${A}`, group: "Dupla chance" },
        { label: `Empate ou ${A}`, group: "Dupla chance" },
      );
      break;
    case "btts":
      out.push(
        { label: "Ambas marcam - Sim", group: "Ambas marcam" },
        { label: "Ambas marcam - Não", group: "Ambas marcam" },
      );
      break;
    case "ou":
      for (const l of OU_LINES) {
        out.push({ label: `Mais de ${l} gols`, group: "Total de gols" });
        out.push({ label: `Menos de ${l} gols`, group: "Total de gols" });
      }
      break;
    case "ah":
      for (const l of AH_LINES) {
        const sign = l > 0 ? `+${l}` : `${l}`;
        out.push({ label: `${H} ${sign}`, group: "Handicap asiático" });
        out.push({ label: `${A} ${(-l > 0 ? `+${-l}` : `${-l}`)}`, group: "Handicap asiático" });
      }
      break;
    case "corners":
      for (const l of [7.5, 8.5, 9.5, 10.5]) {
        out.push({ label: `Mais de ${l} escanteios`, group: "Escanteios" });
        out.push({ label: `Menos de ${l} escanteios`, group: "Escanteios" });
      }
      break;
    case "cards":
      for (const l of [2.5, 3.5, 4.5]) {
        out.push({ label: `Mais de ${l} cartões`, group: "Cartões" });
        out.push({ label: `Menos de ${l} cartões`, group: "Cartões" });
      }
      break;
  }
  return out;
}

/** Common market names to suggest when the user clicks the market field. */
export const COMMON_MARKETS: string[] = [
  "Resultado final (1X2)",
  "Dupla chance",
  "Ambas marcam",
  "Total de gols",
  "Handicap asiático",
  "Escanteios",
  "Cartões",
  "Resultado + Ambas marcam",
  "Primeiro a marcar",
];