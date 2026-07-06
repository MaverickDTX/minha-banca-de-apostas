// API-Sports multi-esporte — registry de adapters para todos os produtos.
// Cada produto é um host separado, mesma auth x-apisports-key.
// Docs: https://api-sports.io/documentation
// Free tier: 100 req/dia POR produto.

import { translateEventName, translateLeague, translateTeamName } from "@/lib/translate";
import type { SportEvent } from "@/lib/sportsdb";
import { searchEventsApiSports } from "@/lib/apisports";
import { searchF1Races } from "@/lib/apisportsF1";

const API_KEY = import.meta.env.VITE_API_SPORTS_KEY as string | undefined;

function headers(): HeadersInit {
  return { "x-apisports-key": API_KEY ?? "" };
}

function logApiError(host: string, params: string, json: unknown) {
  if (!import.meta.env.DEV) return;
  const err = (json as Record<string, unknown>)?.errors;
  if (err && (Array.isArray(err) ? err.length : Object.keys(err).length)) {
    console.warn("[api-sports]", host, "errors:", err, "params:", params);
  }
}

function getSeason(): number {
  return new Date().getFullYear();
}

function seasonParam(fmt: "year" | "range"): string {
  const now = new Date();
  const y = now.getFullYear();
  if (fmt === "year") return String(y);
  const start = now.getMonth() >= 6 ? y : y - 1;
  return `${start}-${start + 1}`;
}

// ---------------------------------------------------------------------------
// Types genéricos (v1 team games)
// ---------------------------------------------------------------------------
type V1Team = { id: number; name: string };
type V1Game = {
  id: number;
  date: string;
  teams: { home: V1Team; away: V1Team };
  league?: { name?: string };
};

// ---------------------------------------------------------------------------
// Adapter: v1 team sports (basketball, volleyball, american-football, baseball,
// hockey, handball). Padrão: /teams?search= → /games?team=&season=
// ---------------------------------------------------------------------------
async function searchV1TeamSport(
  host: string,
  query: string,
  sport: string,
  seasonFmt: "year" | "range",
  signal?: AbortSignal,
): Promise<SportEvent[]> {
  if (!API_KEY) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const season = seasonParam(seasonFmt);

  // 1) Search teams (v1 devolve flat, não aninhado como v3)
  let teamId: number | null = null;
  try {
    const res = await fetch(`https://${host}/teams?search=${encodeURIComponent(q)}`, {
      headers: headers(),
      signal,
    });
    if (res.ok) {
      const json = await res.json();
      logApiError(host, `teams?search=${encodeURIComponent(q)}`, json);
      const teams: V1Team[] = Array.isArray(json?.response) ? json.response.slice(0, 1) : [];
      teamId = teams[0]?.id ?? null;
    }
  } catch {
    /* ignore */
  }

  if (!teamId) return [];

  // 2) Get games for the team in the current season
  try {
    const res = await fetch(`https://${host}/games?team=${teamId}&season=${season}`, {
      headers: headers(),
      signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    logApiError(host, `games?team=${teamId}&season=${season}`, json);
    const games: V1Game[] = Array.isArray(json?.response) ? json.response : [];

    return games
      .map((g) => {
        const home = translateTeamName(g.teams.home.name);
        const away = translateTeamName(g.teams.away.name);
        const rawName = `${g.teams.home.name} vs ${g.teams.away.name}`;
        return {
          id: `apisports-${host.split(".")[1]}-${g.id}`,
          name: translateEventName(rawName, g.teams.home.name, g.teams.away.name),
          sport,
          league: translateLeague(g.league?.name ?? ""),
          date: new Date(g.date).toISOString(),
          homeTeam: home,
          awayTeam: away,
        } satisfies SportEvent;
      })
      .sort((a, b) => {
        const at = a.date ? Date.parse(a.date) : Infinity;
        const bt = b.date ? Date.parse(b.date) : Infinity;
        const now = Date.now();
        const af = at >= now ? 0 : 1;
        const bf = bt >= now ? 0 : 1;
        if (af !== bf) return af - bf;
        return Math.abs(at - now) - Math.abs(bt - now);
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Adapter: MMA (v1.mma.api-sports.io)
// ---------------------------------------------------------------------------
type MmaFighter = { id: number; name: string };
type MmaFight = {
  id: number;
  date: string;
  fighters: { fighter: { id: number; name: string } }[];
};

async function searchMma(
  query: string,
  signal?: AbortSignal,
): Promise<SportEvent[]> {
  if (!API_KEY) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  // 1) Find fighter by name (não depende de temporada)
  let fighterId: number | null = null;
  let fighterName = "";
  try {
    const res = await fetch(
      `https://v1.mma.api-sports.io/fighters?search=${encodeURIComponent(q)}`,
      { headers: headers(), signal },
    );
    if (res.ok) {
      const json = await res.json();
      logApiError("v1.mma.api-sports.io", `fighters?search=${encodeURIComponent(q)}`, json);
      const fighters: MmaFighter[] = Array.isArray(json?.response)
        ? json.response.slice(0, 1)
        : [];
      fighterId = fighters[0]?.id ?? null;
      fighterName = fighters[0]?.name ?? "";
    }
  } catch {
    /* ignore */
  }

  if (!fighterId) return [];

  // 2) Get fights — free plan só cobre 2022–2024; tenta da mais recente p/ mais antiga
  const seasons = [getSeason() - 2, getSeason() - 3, getSeason() - 4]; // 2024, 2023, 2022
  for (const s of seasons) {
    try {
      const res = await fetch(
        `https://v1.mma.api-sports.io/fights?fighter=${fighterId}&season=${s}`,
        { headers: headers(), signal },
      );
      if (!res.ok) continue;
      const json = await res.json();
      logApiError("v1.mma.api-sports.io", `fights?fighter=${fighterId}&season=${s}`, json);
      const fights: MmaFight[] = Array.isArray(json?.response) ? json.response : [];
      if (fights.length === 0) continue;

      return fights.map((f) => {
        const a = f.fighters[0]?.fighter.name ?? "";
        const b = f.fighters[1]?.fighter.name ?? "";
        const rawName = `${a} vs ${b}`;
        return {
          id: `apisports-mma-${f.id}`,
          name: translateEventName(rawName, a, b),
          sport: "MMA",
          league: "MMA",
          date: new Date(f.date).toISOString(),
          homeTeam: a,
          awayTeam: b,
        } satisfies SportEvent;
      });
    } catch {
      continue;
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Registry: label PT-BR (lowercased) → config do produto API-Sports
// ---------------------------------------------------------------------------
type ApiKind =
  | { kind: "v3_football" }
  | { kind: "v1_team"; host: string; sport: string; seasonFmt: "year" | "range" }
  | { kind: "mma" }
  | { kind: "f1" };

const SPORT_API: Record<string, ApiKind> = {
  futebol: { kind: "v3_football" },
  basquete: { kind: "v1_team", host: "v1.basketball.api-sports.io", sport: "Basketball", seasonFmt: "range" },
  "vôlei": { kind: "v1_team", host: "v1.volleyball.api-sports.io", sport: "Volleyball", seasonFmt: "range" },
  "futebol americano": { kind: "v1_team", host: "v1.american-football.api-sports.io", sport: "American Football", seasonFmt: "year" },
  nfl: { kind: "v1_team", host: "v1.american-football.api-sports.io", sport: "American Football", seasonFmt: "year" },
  beisebol: { kind: "v1_team", host: "v1.baseball.api-sports.io", sport: "Baseball", seasonFmt: "year" },
  "hóquei no gelo": { kind: "v1_team", host: "v1.hockey.api-sports.io", sport: "Ice Hockey", seasonFmt: "range" },
  handebol: { kind: "v1_team", host: "v1.handball.api-sports.io", sport: "Handball", seasonFmt: "range" },
  mma: { kind: "mma" },
  automobilismo: { kind: "f1" },
};

/** Esportes que o TheSportsDB cobre bem → tentar TheSportsDB primeiro */
const SPORTS_WITH_TSDB_FIRST = new Set([
  "futebol", "basquete",
  "vôlei", "hóquei no gelo", "handebol",
  "futebol americano", "nfl", "beisebol",
]);

/**
 * Busca eventos de um esporte específico via API-Sports.
 * Retorna [] se o esporte não tem produto API-Sports ou se a chave não o inclui.
 */
export async function searchEventsBySport(
  query: string,
  signal: AbortSignal | undefined,
  sportLabel: string,
): Promise<SportEvent[]> {
  const api = SPORT_API[sportLabel.trim().toLowerCase()];
  if (!api) return [];

  switch (api.kind) {
    case "v3_football":
      return searchEventsApiSports(query, signal);
    case "v1_team":
      return searchV1TeamSport(api.host, query, api.sport, api.seasonFmt, signal);
    case "mma":
      return searchMma(query, signal);
    case "f1":
      return searchF1Races(query, signal);
  }
}

/**
 * Informa se o esporte tem um produto API-Sports dedicado.
 * Usado pelo searchEvents para decidir se pula TheSportsDB.
 */
export function hasApiProduct(sportLabel: string): boolean {
  return sportLabel.trim().toLowerCase() in SPORT_API;
}

/**
 * Informa se o TheSportsDB deve ser tentado primeiro.
 * Falso → chama o adapter direto.
 */
export function shouldTryTheSportsDbFirst(sportLabel: string): boolean {
  const key = sportLabel.trim().toLowerCase();
  return SPORTS_WITH_TSDB_FIRST.has(key);
}
