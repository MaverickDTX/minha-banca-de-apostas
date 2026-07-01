// Sugestões de "Mercado" (por esporte) e de "Seleção" (derivadas do mercado).

export type SelectionSuggestion = { label: string; group?: string };

const OU_LINES = [0.5, 1.5, 2.5, 3.5];
const AH_LINES = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
const PLAYER_LINES = [0.5, 1.5, 2.5];

// ---------------------------------------------------------------------------
// Mercados por esporte (limpos e separados da seleção)
// ---------------------------------------------------------------------------
const MARKETS_BY_SPORT: Record<string, string[]> = {
  Futebol: [
    "Resultado final (1X2)",
    "Dupla chance",
    "Ambas marcam",
    "Total de gols",
    "Handicap asiático",
    "Escanteios",
    "Cartões",
    "Intervalo/Final (HT/FT)",
    "Placar exato",
    "Primeiro a marcar",
    "Resultado + Ambas marcam",
    "Total de gols e Ambas Marcam",
    "Jogador para Marcar (Artilheiro)",
    "Jogador a ser Advertido",
    "Chutes do Jogador",
    "Chutes ao Gol do Jogador",
    "Desarmes do Jogador",
    "Faltas Sofridas pelo Jogador",
    "Defesas do Goleiro",
  ],
  Tênis: [
    "Vencedor da Partida",
    "Vencedor do 1º Set",
    "Total de Games",
    "Handicap de Games",
    "Total de Sets",
    "Placar de Sets",
    "Games do Jogador",
    "Aces do Jogador",
  ],
  Basquete: [
    "Vencedor (Moneyline)",
    "Handicap (Spread)",
    "Total de Pontos",
    "Total de Pontos do Time",
    "Vencedor do 1º Quarto",
    "Pontos do Jogador",
    "Rebotes do Jogador",
    "Assistências do Jogador",
    "Pontos + Rebotes + Assistências (PRA)",
    "Cestas de 3 do Jogador",
    "Duplo-duplo",
    "Triplo-duplo",
  ],
};

const GENERIC_MARKETS: string[] = [
  "Vencedor (Moneyline)",
  "Handicap",
  "Total (Over/Under)",
  "Dupla chance",
  "Props de Jogador",
];

/** Mercados sugeridos ao focar o campo Mercado, conforme o esporte. */
export function getMarketSuggestions(sport?: string): string[] {
  if (sport && MARKETS_BY_SPORT[sport]) return MARKETS_BY_SPORT[sport];
  return GENERIC_MARKETS;
}

/** Lista plana (compat.): usada como fallback quando não há esporte. */
export const COMMON_MARKETS: string[] = MARKETS_BY_SPORT.Futebol;

// ---------------------------------------------------------------------------
// Detecção do tipo de mercado (por palavra-chave), multi-esporte
// ---------------------------------------------------------------------------
type MarketType =
  | "1x2" | "dc" | "btts" | "ou" | "ah" | "corners" | "cards"
  | "player" | "scorer"
  | "tennis_winner" | "tennis_games" | "tennis_sets"
  | "nba_ml" | "nba_spread" | "nba_points" | "nba_player";

function detectMarketType(market: string): MarketType {
  const m = market.toLowerCase().trim();
  if (!m) return "1x2";

  // Basquete
  if (m.includes("rebote") || m.includes("assist") || m.includes("pra") || m.includes("cestas de 3") || m.includes("duplo") || m.includes("triplo")) return "nba_player";
  if (m.includes("ponto")) return "nba_points";
  if (m.includes("spread")) return "nba_spread";

  // Tênis
  if (m.includes("game") || m.includes("ace")) return "tennis_games";
  if (m.includes("set")) return m.includes("vencedor") ? "tennis_winner" : "tennis_sets";

  // Futebol / genéricos
  if (m.includes("artilheiro") || (m.includes("marcar") && m.includes("jogador"))) return "scorer";
  if (m.includes("advertid") || m.includes("chute") || m.includes("desarme") || m.includes("falta") || m.includes("defesa") || m.includes("jogador")) return "player";
  if (m.includes("ambas") || m.includes("btts") || m.includes("both")) return "btts";
  if (m.includes("escanteio") || m.includes("corner")) return "corners";
  if (m.includes("cart")) return "cards";
  if (m.includes("handicap") || m.includes("asi")) return "ah";
  if (m.includes("dupla") || m.includes("double")) return "dc";
  if (m.includes("over") || m.includes("under") || m.includes("mais") || m.includes("menos") || m.includes("gols") || m.includes("total")) return "ou";
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
    case "tennis_winner":
      out.push({ label: `Vitória ${H}`, group: "Resultado" });
      if (type === "1x2") out.push({ label: "Empate", group: "Resultado" });
      out.push({ label: `Vitória ${A}`, group: "Resultado" });
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
    case "scorer":
      out.push(
        { label: "Para marcar a qualquer momento", group: "Artilheiro" },
        { label: "Para marcar o primeiro gol", group: "Artilheiro" },
        { label: "Para marcar 2+ gols", group: "Artilheiro" },
      );
      break;
    case "player":
      for (const l of PLAYER_LINES) {
        out.push({ label: `Mais de ${l}`, group: "Props de jogador" });
      }
      out.push({ label: "Sim", group: "Props de jogador" });
      break;
    case "tennis_games":
      for (const l of [20.5, 21.5, 22.5, 23.5]) {
        out.push({ label: `Mais de ${l} games`, group: "Games" });
        out.push({ label: `Menos de ${l} games`, group: "Games" });
      }
      break;
    case "tennis_sets":
      out.push(
        { label: `2-0 ${H}`, group: "Placar de sets" },
        { label: `2-1 ${H}`, group: "Placar de sets" },
        { label: `2-1 ${A}`, group: "Placar de sets" },
        { label: `2-0 ${A}`, group: "Placar de sets" },
      );
      break;
    case "nba_ml":
      out.push(
        { label: `Vitória ${H}`, group: "Vencedor" },
        { label: `Vitória ${A}`, group: "Vencedor" },
      );
      break;
    case "nba_spread":
      for (const l of [-8.5, -5.5, -3.5, 3.5, 5.5, 8.5]) {
        const sign = l > 0 ? `+${l}` : `${l}`;
        out.push({ label: `${H} ${sign}`, group: "Handicap" });
      }
      break;
    case "nba_points":
      for (const l of [205.5, 215.5, 225.5, 235.5]) {
        out.push({ label: `Mais de ${l} pontos`, group: "Total de pontos" });
        out.push({ label: `Menos de ${l} pontos`, group: "Total de pontos" });
      }
      break;
    case "nba_player":
      for (const l of [9.5, 14.5, 19.5, 24.5]) {
        out.push({ label: `Mais de ${l}`, group: "Props de jogador" });
      }
      out.push(
        { label: "Duplo-duplo - Sim", group: "Props de jogador" },
        { label: "Triplo-duplo - Sim", group: "Props de jogador" },
      );
      break;
  }
  return out;
}
