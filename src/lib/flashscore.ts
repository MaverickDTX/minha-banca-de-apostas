// Flashscore4 (RapidAPI) — fonte de fallback para tênis quando o primário
// (Matchstat) falha por cota (429). A mesma X-RapidAPI-Key da conta serve para
// todos os hosts; o proxy `tennis-fixtures` injeta a chave server-side.
//
// Cadeia de uso: general/search (nome → player_id, filtrando sport.id==2)
//   → players/tennis/results  (histórico) + players/tennis/fixtures (futuros).
// Este módulo cobre a NORMALIZAÇÃO pura das respostas para SportEvent.
import type { SportEvent } from "@/lib/sportsdb";

// ---- Tipos da resposta bruta do Flashscore (results/fixtures) ----------------

type FsPlayer = { player_id?: string; name?: string };
// Em simples, home_team/away_team são objetos; em duplas, arrays de jogadores.
type FsSide = FsPlayer | FsPlayer[];

type FsMatch = {
  match_id?: string;
  timestamp?: number; // Unix segundos
  home_team?: FsSide;
  away_team?: FsSide;
};

type FsTournamentGroup = {
  tournament_url?: string;
  name?: string;
  matches?: FsMatch[];
};

// Item da busca general/search
export type FsSearchItem = {
  id?: string;
  type?: string; // "player" | "player_in_team" | ...
  name?: string;
  url?: string;
  sport?: { id?: number; name?: string };
  country_name?: string | null;
};

const TENNIS_SPORT_ID = 2;

/**
 * Deriva tour/nível a partir do tournament_url do Flashscore.
 * Ex.: "/tennis/itf-men-singles/m25-uriage/"      → "ITF"
 *      "/tennis/challenger-men-singles/royan/"    → "Challenger"
 *      "/tennis/atp-singles/french-open/"         → "ATP"
 *      "/tennis/wta-singles/wimbledon/"           → "WTA"
 *      "/tennis/boys-singles/wimbledon/"          → "Juvenil"
 */
export function deriveTour(tournamentUrl?: string): string {
  const url = (tournamentUrl ?? "").toLowerCase();
  if (url.includes("/itf-")) return "ITF";
  if (url.includes("/challenger-")) return "Challenger";
  if (url.includes("/atp-")) return "ATP";
  if (url.includes("/wta-")) return "WTA";
  if (url.includes("/boys-") || url.includes("/girls-")) return "Juvenil";
  return "Tênis";
}

/** Nome de um lado: jogador (objeto) ou dupla (array → "A / B"). */
function sideName(side?: FsSide): string {
  if (!side) return "";
  if (Array.isArray(side)) return side.map((p) => p?.name ?? "").filter(Boolean).join(" / ");
  return side.name ?? "";
}

/** timestamp Unix (s) → ISO string UTC, ou null. */
function tsToIso(timestamp?: number): string | null {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return null;
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Converte a resposta bruta do Flashscore (results OU fixtures — mesmo formato,
 * agrupado por torneio) em SportEvent[]. Função PURA, sem I/O.
 * Descarta partidas sem os dois lados nomeados.
 */
export function parseFlashscoreMatches(raw: unknown): SportEvent[] {
  if (!Array.isArray(raw)) return [];
  const groups = raw as FsTournamentGroup[];
  const events: SportEvent[] = [];

  for (const group of groups) {
    const tour = deriveTour(group?.tournament_url);
    const matches = Array.isArray(group?.matches) ? group.matches : [];
    for (const m of matches) {
      const home = sideName(m?.home_team);
      const away = sideName(m?.away_team);
      if (!home || !away) continue;
      events.push({
        id: `tennis-fs-${m?.match_id ?? `${home}-${away}`}`,
        name: `${home} x ${away}`,
        sport: "Tênis",
        league: tour,
        date: tsToIso(m?.timestamp),
        homeTeam: home,
        awayTeam: away,
      });
    }
  }
  return events;
}

/**
 * Filtra os resultados da general/search para jogadores de TÊNIS.
 * (A busca mistura futebol e tênis; queremos sport.id==2 e type=player.)
 * Retorna os player_id na ordem em que vieram (relevância do Flashscore).
 */
export function tennisPlayerIdsFromSearch(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const items = raw as FsSearchItem[];
  return items
    .filter((i) => i?.sport?.id === TENNIS_SPORT_ID && i?.type === "player" && !!i?.id)
    .map((i) => i.id as string);
}
