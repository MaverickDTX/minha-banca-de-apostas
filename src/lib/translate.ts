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

// Ligas cujo nome NÃO é único no mundo: "Serie A" existe no Brasil, na Itália e
// no Equador. Resolver por PAÍS, e sempre ANTES da lista genérica.
//
// Era exatamente aqui que o Brasileirão se perdia: a lista abaixo tinha um
// `[/Serie A/i, "Serie A"]` que, por ser first-match-wins, engolia
// "Brazilian Serie A" e devolvia "Serie A" — o mesmo rótulo da liga italiana.
// Resultado: Brasileirão e Serie A italiana caíam na MESMA chave de agrupamento
// do Analytics, e "Brazilian Serie B"/"C" ficavam sem tradução nenhuma.
//
// O país vem do campo `country` da API quando existe; quando não vem, o próprio
// nome costuma trazê-lo ("Brazilian Serie A", "Ecuadorian Serie A"), então a
// checagem roda sobre `country + league`.
const BY_COUNTRY: Array<{ country: RegExp; league: RegExp; pt: (m: RegExpMatchArray) => string }> = [
  {
    country: /brazil|brasil/i,
    // \b após a divisão evita capturar "Série A1"/"A2" dos estaduais.
    league: /s[ée]rie\s*([abcd])\b/i,
    pt: (m) => `Brasileirão Série ${m[1].toUpperCase()}`,
  },
  {
    country: /ecuador|equador/i,
    league: /s[ée]rie\s*a\b/i,
    pt: () => "Serie A (Equador)",
  },
];

// ATENÇÃO: first-match-wins. Regras mais específicas vêm primeiro — eliminatórias
// antes do torneio principal, "K League 2" antes de "K League".
const LEAGUES: Array<[RegExp, string]> = [
  // Seleções e competições internacionais
  [/FIFA World Cup Qualifiers?/i, "Eliminatórias da Copa do Mundo FIFA"],
  [/FIFA Club World Cup|Club World Cup/i, "Mundial de Clubes"],
  // Exigir "FIFA" é deliberado: "World Cup" solto casaria com as copas do mundo
  // de rúgbi, basquete, críquete etc., jogando todas na mesma chave de
  // agrupamento da de futebol. Sem FIFA no nome, o original é preservado.
  [/FIFA World Cup/i, "Copa do Mundo FIFA"],
  [/UEFA European Championship Qualif(ying|iers?)/i, "Eliminatórias da Eurocopa"],
  [/UEFA European Championship/i, "Eurocopa"],
  [/UEFA Nations League/i, "Liga das Nações"],
  [/UEFA Champions League/i, "Liga dos Campeões"],
  [/UEFA Europa League/i, "Liga Europa"],
  // A competição foi renomeada de "UEFA Europa Conference League" para
  // "UEFA Conference League" — a regex antiga exigia o "Europa" e por isso
  // deixava o nome atual sem tradução.
  [/UEFA (Europa )?Conference League/i, "Liga Conferência"],
  [/UEFA Super Cup/i, "Supercopa da UEFA"],
  [/Copa America/i, "Copa América"],
  [/Copa Libertadores/i, "Copa Libertadores"],
  [/Recopa Sudamericana/i, "Recopa Sul-Americana"],
  [/Copa Sudamericana/i, "Copa Sul-Americana"],
  [/Friendl(y|ies)/i, "Amistoso"],

  // Américas
  [/Argentina Torneo Federal A/i, "Torneo Federal A (Argentina)"],
  [/Argentinian Primera Division|Argentina Primera Division/i, "Campeonato Argentino"],
  [/MLS Next Pro/i, "MLS Next Pro"],
  [/American Major League Soccer|Major League Soccer/i, "MLS"],
  [/Mexican Primera League|Liga MX/i, "Campeonato Mexicano"],
  [/Uruguayan Primera Division/i, "Campeonato Uruguaio"],
  [/Peruvian Primera Division/i, "Campeonato Peruano"],
  [/Chilean Primera Division/i, "Campeonato Chileno"],
  [/Colombian? Categor[ií]a Primera A/i, "Categoría Primera A (Colômbia)"],

  // Europa — nome próprio permanece; o qualificador de país vira sufixo.
  [/Premier League/i, "Premier League"],
  [/La Liga/i, "La Liga"],
  [/Bundesliga/i, "Bundesliga"],
  [/Ligue 1/i, "Ligue 1"],
  [/Eredivisie/i, "Eredivisie"],
  [/Primeira Liga/i, "Primeira Liga"],
  [/Swedish Allsvenskan/i, "Allsvenskan (Suécia)"],
  [/Norwegian Eliteserien/i, "Eliteserien (Noruega)"],
  [/Norwegian 1\.? Divisjon/i, "1. Divisjon (Noruega)"],
  [/Polish Ekstraklasa/i, "Ekstraklasa (Polônia)"],
  [/Polish I liga/i, "I liga (Polônia)"],
  [/Slovenian 1\.? SNL/i, "1. SNL (Eslovênia)"],
  [/Swiss Super League/i, "Super League (Suíça)"],
  [/Danish Superliga/i, "Superliga (Dinamarca)"],
  [/Bulgarian First League/i, "Campeonato Búlgaro"],

  // Ásia
  [/South Korean K League 2|K League 2/i, "K League 2 (Coreia do Sul)"],
  [/South Korean K League 1?|K League 1/i, "K League 1 (Coreia do Sul)"],

  // Itália — só chega aqui o que BY_COUNTRY já descartou como Brasil/Equador.
  // Ancorado para não reescrever nomes compostos de outros países.
  [/Italian Serie A|^Serie A$/i, "Serie A"],
  [/Italian Serie B|^Serie B$/i, "Serie B"],
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

/**
 * Traduz o nome da liga para PT-BR.
 *
 * `country` é opcional e vem do campo homônimo da API quando disponível. É o
 * que permite distinguir "Serie A" do Brasil, da Itália e do Equador — sem ele,
 * um "Serie A" cru fica como está (ambíguo) em vez de virar Brasileirão errado.
 * Idempotente: rodar de novo sobre um nome já traduzido devolve o mesmo valor.
 */
export function translateLeague(league: string, country?: string): string {
  const raw = league.trim();
  if (!raw) return raw;
  const hay = `${country ?? ""} ${raw}`;
  for (const rule of BY_COUNTRY) {
    if (!rule.country.test(hay)) continue;
    const m = raw.match(rule.league);
    if (m) return rule.pt(m);
  }
  for (const [re, pt] of LEAGUES) if (re.test(raw)) return pt;
  return raw;
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