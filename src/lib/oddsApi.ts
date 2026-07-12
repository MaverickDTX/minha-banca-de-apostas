// The Odds API v4 — adapter para MMA (eventos futuros com datas/horários).
// Docs: https://the-odds-api.com/liveapi/guides/v4
// Free tier: 500 créditos/mês. Cada call custa markets × regions.
// Para MMA: 1 market (h2h) × 1 region (us) = 1 crédito.

import type { SportEvent } from "@/lib/sportsdb";

const KEY = import.meta.env.VITE_ODDS_API_KEY as string | undefined;
const BASE = "https://api.the-odds-api.com/v4";

type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: unknown[];
};

const groupCache = new Map<string, SportEvent[]>();

const normText = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

async function fetchSport(
  sportKey: string,
  signal?: AbortSignal,
): Promise<SportEvent[]> {
  if (!KEY) return [];
  const url = `${BASE}/sports/${sportKey}/odds?regions=us&markets=h2h&apiKey=${KEY}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const json: unknown = await res.json();
  const arr: OddsEvent[] = Array.isArray(json) ? json : [];
  return arr.map((e) => ({
    id: `oddsapi-${e.id}`,
    name: `${e.home_team} vs ${e.away_team}`,
    sport: "MMA",
    league: e.sport_title,
    date: new Date(e.commence_time).toISOString(),
    homeTeam: e.home_team,
    awayTeam: e.away_team,
  }));
}

export type OddsOpts = { includeAll?: boolean };

export async function searchOddsApiEvents(
  query: string,
  signal?: AbortSignal,
  opts?: OddsOpts,
): Promise<SportEvent[]> {
  const q = query.trim();
  if (!KEY) return [];

  const sportKey = "mma_mixed_martial_arts";

  let all = groupCache.get(sportKey);
  if (!all) {
    all = await fetchSport(sportKey, signal);
    groupCache.set(sportKey, all); // cache incluso se vazio — evita re-fetch
  }

  if (opts?.includeAll) return all;

  const needle = normText(q);
  if (!needle) return all;

  return all.filter((ev) => {
    const hay = normText(
      [ev.homeTeam ?? "", ev.awayTeam ?? "", ev.name, ev.sport, ev.league].join(" "),
    );
    return hay.includes(needle);
  });
}

export function isOddsApiSport(label: string): boolean {
  return label.trim().toLowerCase() === "mma";
}
