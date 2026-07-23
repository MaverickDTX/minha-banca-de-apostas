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
    "Total de gols Asiáticos",
    "Handicap asiático",
    "Escanteios",
    "Escanteios Asiáticos",
    "Escanteios 1º Tempo",
    "Handicap de Escanteios",
    "Cartões",
    "Cartões Asiáticos",
    "Cartões 1º Tempo",
    "Handicap de Cartões",
    "Time com Mais Cartões",
    "Intervalo/Final (HT/FT)",
    "Placar exato",
    "Primeiro a marcar",
    "Resultado + Ambas marcam",
    "Total de gols e Ambas Marcam",
    "Total de gols 1º Tempo",
    "Jogador para Marcar (Artilheiro)",
    "Jogador para Marcar 2+ Gols",
    "Jogador para Marcar 3+ Gols",
    "Jogador para Marcar ou Dar Assistência",
    "Jogador para Dar Assistência",
    "Jogador a ser Advertido",
    "Chutes do Jogador",
    "Chutes ao Gol do Jogador",
    "Desarmes do Jogador",
    "Faltas Sofridas pelo Jogador",
    "Defesas do Goleiro",
    "Criar Aposta",
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
  Automobilismo: [
    "Vencedor da corrida",
    "Pódio (Top 3)",
    "Top 6",
    "Top 10 (Pontos)",
    "Pole position",
    "Volta mais rápida",
    "Duelo entre pilotos (H2H)",
    "Primeiro a abandonar (DNF)",
    "Safety car na corrida",
    "Vencedor do campeonato",
    "Vencedor da Sprint",
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
    "Pontos + Rebotes do Jogador",
    "Pontos + Assistências do Jogador",
    "Rebotes + Assistências do Jogador",
    "Pontos + Rebotes + Assistências (PRA)",
    "Tocos do Jogador",
    "Turnovers do Jogador",
    "Cestas de 3 do Jogador",
    "Cestas de 3 do Time",
    "Duplo-duplo",
    "Triplo-duplo",
    "Criar Aposta",
  ],
  MMA: [
    "Vencedor da luta (Moneyline)",
    "Método de vitória",
    "Vitória por KO/TKO",
    "Vitória por Finalização",
    "Vitória por Decisão",
    "Round de encerramento",
    "Total de rounds (Over/Under)",
    "A luta vai à distância?",
    "Handicap de rounds",
  ],
  "Futebol Americano": [
    "Vencedor (Moneyline)",
    "Handicap (Spread)",
    "Total de Pontos",
    "Total de Pontos do Time",
    "Jardas de Passe do Jogador",
    "Jardas Corridas do Jogador",
    "Touchdowns do Jogador",
    "1º a Pontuar",
  ],
  "Vôlei": [
    "Vencedor da Partida",
    "Handicap de Sets",
    "Total de Sets",
    "Placar de Sets",
    "Total de Pontos",
    "Vencedor do Set",
  ],
  "Beisebol": [
    "Vencedor (Moneyline)",
    "Run Line (Handicap)",
    "Total de Corridas (Over/Under)",
    "Total do Time",
    "Rebatidas do Jogador",
    "Home Runs do Jogador",
  ],
  "Hóquei no Gelo": [
    "Vencedor (Moneyline)",
    "Puck Line (Handicap)",
    "Total de Gols (Over/Under)",
    "Ambos Marcam",
    "Gols do Jogador",
    "Assistências do Jogador",
  ],
  "Handebol": [
    "Resultado Final",
    "Handicap",
    "Total de Gols",
    "Dupla Chance",
    "Resultado 1º Tempo",
  ],
  "eSports": [
    "Vencedor (Moneyline)",
    "Handicap de Mapas",
    "Total de Mapas",
    "Total de Rounds",
    "Vencedor do Mapa",
    "Criar Aposta",
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
  | "nba_ml" | "nba_spread" | "nba_points" | "nba_player"
  | "f1_driver" | "f1_h2h" | "f1_yesno"
  | "mma_winner" | "mma_method" | "mma_rounds" | "mma_yesno";

function detectMarketType(market: string, sport?: string): MarketType {
  const m = market.toLowerCase().trim();
  if (!m) return "1x2";

  // MMA (antes da heurística genérica para evitar colisões)
  if (sport === "MMA") {
    if (m.includes("distancia") || m.includes("distância")) return "mma_yesno";
    if (m.includes("round") || m.includes("total")) return "mma_rounds";
    if (m.includes("metodo") || m.includes("método") || m.includes("ko") ||
        m.includes("nocaute") || m.includes("finaliz") || m.includes("submiss") ||
        m.includes("decis")) return "mma_method";
    return "mma_winner";
  }

  // F1 / Automobilismo (antes da heurística genérica para evitar colisões)
  if (sport === "Automobilismo") {
    if (m.includes("duelo") || m.includes("h2h")) return "f1_h2h";
    if (m.includes("dnf") || m.includes("abandon") || m.includes("safety") || m.includes("car")) return "f1_yesno";
    return "f1_driver";
  }

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
  sport?: string,
): SelectionSuggestion[] {
  const type = detectMarketType(market, sport);
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
    case "f1_driver":
      // Nomes dos pilotos vêm da API (getF1Drivers); enquanto não carregados, campo é texto livre
      break;
    case "f1_h2h":
      // Template sem pilotos concretos; campo é texto livre
      break;
    case "f1_yesno":
      out.push(
        { label: "Sim", group: "Sim/Não" },
        { label: "Não", group: "Sim/Não" },
      );
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
    case "mma_winner":
      out.push(
        { label: `Vitória do ${H}`, group: "Vencedor" },
        { label: `Vitória do ${A}`, group: "Vencedor" },
      );
      break;
    case "mma_method":
      out.push(
        { label: `${H} por KO/TKO`, group: "Método" },
        { label: `${H} por Finalização`, group: "Método" },
        { label: `${H} por Decisão`, group: "Método" },
        { label: `${A} por KO/TKO`, group: "Método" },
        { label: `${A} por Finalização`, group: "Método" },
        { label: `${A} por Decisão`, group: "Método" },
      );
      break;
    case "mma_rounds":
      for (const l of [1.5, 2.5, 3.5, 4.5]) {
        out.push({ label: `Mais de ${l} rounds`, group: "Total de rounds" });
        out.push({ label: `Menos de ${l} rounds`, group: "Total de rounds" });
      }
      break;
    case "mma_yesno":
      out.push(
        { label: "Sim (vai à distância)", group: "Sim/Não" },
        { label: "Não (termina antes)", group: "Sim/Não" },
      );
      break;
  }
  return out;
}
