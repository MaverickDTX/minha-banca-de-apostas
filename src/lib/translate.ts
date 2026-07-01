// Light PT-BR translation map for sports data coming from TheSportsDB (English).
// Covers national teams (most affected by the user's complaint), common sports,
// and recurring league phrases. Falls back to the original string when unknown.

const TEAMS: Record<string, string> = {
  // South America
  "Brazil": "Brasil", "Argentina": "Argentina", "Uruguay": "Uruguai", "Paraguay": "Paraguai",
  "Chile": "Chile", "Bolivia": "Bolívia", "Peru": "Peru", "Ecuador": "Equador",
  "Colombia": "Colômbia", "Venezuela": "Venezuela",
  // Europe
  "England": "Inglaterra", "Scotland": "Escócia", "Wales": "País de Gales",
  "Northern Ireland": "Irlanda do Norte", "Ireland": "Irlanda",
  "France": "França", "Germany": "Alemanha", "Spain": "Espanha", "Italy": "Itália",
  "Portugal": "Portugal", "Netherlands": "Holanda", "Belgium": "Bélgica",
  "Switzerland": "Suíça", "Austria": "Áustria", "Poland": "Polônia",
  "Czech Republic": "República Tcheca", "Czechia": "República Tcheca",
  "Croatia": "Croácia", "Serbia": "Sérvia", "Slovenia": "Eslovênia",
  "Slovakia": "Eslováquia", "Hungary": "Hungria", "Romania": "Romênia",
  "Bulgaria": "Bulgária", "Greece": "Grécia", "Turkey": "Turquia",
  "Sweden": "Suécia", "Norway": "Noruega", "Denmark": "Dinamarca",
  "Finland": "Finlândia", "Iceland": "Islândia", "Russia": "Rússia",
  "Ukraine": "Ucrânia", "Belarus": "Belarus",
  "Bosnia and Herzegovina": "Bósnia e Herzegovina", "North Macedonia": "Macedônia do Norte",
  "Albania": "Albânia", "Montenegro": "Montenegro", "Kosovo": "Kosovo",
  // Africa
  "Morocco": "Marrocos", "Algeria": "Argélia", "Tunisia": "Tunísia",
  "Egypt": "Egito", "Nigeria": "Nigéria", "Senegal": "Senegal",
  "Cameroon": "Camarões", "Ivory Coast": "Costa do Marfim", "Ghana": "Gana",
  "South Africa": "África do Sul",
  // Americas
  "United States": "Estados Unidos", "USA": "Estados Unidos",
  "Mexico": "México", "Canada": "Canadá", "Costa Rica": "Costa Rica",
  "Panama": "Panamá", "Honduras": "Honduras", "Jamaica": "Jamaica",
  // Asia / Oceania
  "Japan": "Japão", "South Korea": "Coreia do Sul", "North Korea": "Coreia do Norte",
  "China PR": "China", "China": "China", "Australia": "Austrália",
  "New Zealand": "Nova Zelândia", "Saudi Arabia": "Arábia Saudita",
  "Iran": "Irã", "Iraq": "Iraque", "Qatar": "Catar",
  "United Arab Emirates": "Emirados Árabes Unidos", "Israel": "Israel",
};

const LEAGUES: Array<[RegExp, string]> = [
  [/FIFA World Cup Qualifiers?/i, "Eliminatórias da Copa do Mundo"],
  [/UEFA European Championship Qualif(ying|iers?)/i, "Eliminatórias da Eurocopa"],
  [/UEFA European Championship/i, "Eurocopa"],
  [/UEFA Nations League/i, "Liga das Nações"],
  [/UEFA Champions League/i, "Liga dos Campeões"],
  [/UEFA Europa League/i, "Liga Europa"],
  [/UEFA Europa Conference League/i, "Liga Conferência"],
  [/Copa America/i, "Copa América"],
  [/Copa Libertadores/i, "Copa Libertadores"],
  [/Copa Sudamericana/i, "Copa Sul-Americana"],
  [/Friendl(y|ies)/i, "Amistoso"],
  [/Premier League/i, "Premier League"],
  [/La Liga/i, "La Liga"],
  [/Serie A/i, "Serie A"],
  [/Bundesliga/i, "Bundesliga"],
  [/Ligue 1/i, "Ligue 1"],
];

function translateTeam(name: string): string {
  const trimmed = name.trim();
  return TEAMS[trimmed] ?? trimmed;
}

/** Translate event names like "Uruguay vs Brazil" → "Uruguai x Brasil". */
export function translateEventName(name: string, home?: string, away?: string): string {
  if (home && away) {
    return `${translateTeam(home)} x ${translateTeam(away)}`;
  }
  // Generic fallback: split on " vs " / " - "
  const m = name.split(/\s+(?:vs\.?|x|–|-)\s+/i);
  if (m.length === 2) return `${translateTeam(m[0])} x ${translateTeam(m[1])}`;
  return name;
}

export function translateLeague(league: string): string {
  for (const [re, pt] of LEAGUES) if (re.test(league)) return pt;
  return league;
}

export function translateTeamName(name?: string): string | undefined {
  return name ? translateTeam(name) : undefined;
}

// ---------------------------------------------------------------------------
// Tradução reversa (PT → EN) da *query* de busca.
// As APIs (TheSportsDB, API-Sports) indexam nomes em inglês; sem isso,
// digitar "Alemanha" não encontra "Germany".

const normalizeQuery = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

let PT_TO_EN: Map<string, string> | null = null;

function ptIndex(): Map<string, string> {
  if (!PT_TO_EN) {
    PT_TO_EN = new Map();
    for (const [en, pt] of Object.entries(TEAMS)) {
      const k = normalizeQuery(pt);
      // Primeiro EN vence em colisões (ex.: "China PR" e "China" → "China").
      if (!PT_TO_EN.has(k)) PT_TO_EN.set(k, en);
    }
  }
  return PT_TO_EN;
}

/**
 * Traduz a query do usuário (PT) para o nome em inglês usado pelas APIs.
 * Insensível a acentos e caixa. Match exato sempre; match por prefixo
 * (query ≥ 3 chars) apenas quando não-ambíguo ("alem" → "Germany", mas
 * "irl" → null, pois casa "Irlanda" e "Irlanda do Norte").
 * Retorna null quando não há tradução aplicável — o chamador usa a query original.
 */
export function translateQueryToEnglish(query: string): string | null {
  const q = normalizeQuery(query);
  if (q.length < 2) return null;
  const idx = ptIndex();
  const exact = idx.get(q);
  if (exact) return exact;
  if (q.length < 3) return null;
  let hit: string | null = null;
  for (const [pt, en] of idx) {
    if (pt.startsWith(q)) {
      if (hit !== null && hit !== en) return null; // prefixo ambíguo
      hit = en;
    }
  }
  return hit;
}