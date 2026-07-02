// API-Sports (api-football v3) — fallback for event autocomplete.
// Docs: https://api-sports.io/documentation/football/v3
// Free tier: 100 requests/day, all endpoints.

import { translateEventName, translateLeague, translateTeamName } from "@/lib/translate";
import type { SportEvent } from "@/lib/sportsdb";

const API_KEY = import.meta.env.VITE_API_SPORTS_KEY as string | undefined;
const BASE = "https://v3.football.api-sports.io";

function headers(): HeadersInit {
  return { "x-apisports-key": API_KEY ?? "" };
}

type ApiTeam = { id: number; name: string };
type ApiFixture = {
  fixture: { id: number; date: string };
  league: { name: string };
  teams: { home: ApiTeam; away: ApiTeam };
};

function normalize(f: ApiFixture): SportEvent {
  const home = translateTeamName(f.teams.home.name);
  const away = translateTeamName(f.teams.away.name);
  const rawName = `${f.teams.home.name} vs ${f.teams.away.name}`;
  return {
    id: `api-sports-${f.fixture.id}`,
    name: translateEventName(rawName, f.teams.home.name, f.teams.away.name),
    sport: "Soccer",
    league: translateLeague(f.league.name),
    date: new Date(f.fixture.date).toISOString(),
    homeTeam: home,
    awayTeam: away,
  };
}

/**
 * Search upcoming/recent football events via API-Sports.
 * Flow: search teams by name → get next 5 + last 5 fixtures for top 2 hits.
 */
export async function searchEventsApiSports(
  query: string,
  signal?: AbortSignal,
): Promise<SportEvent[]> {
  if (!API_KEY) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  // 1) Search teams
  let teamIds: number[] = [];
  try {
    const res = await fetch(`${BASE}/teams?search=${encodeURIComponent(q)}`, {
      headers: headers(),
      signal,
    });
    if (res.ok) {
      const json = await res.json();
      // 1 time só: cada time custa 2 requests (next+last) e a quota é 100/dia.
      const teams: { team: ApiTeam }[] = Array.isArray(json?.response)
        ? json.response.slice(0, 1)
        : [];
      teamIds = teams.map((t) => t.team.id);
    }
  } catch {
    /* ignore */
  }

  if (teamIds.length === 0) return [];

  // 2) Get next + last fixtures for each team (parallel)
  const results = new Map<string, SportEvent>();
  try {
    const fetches = teamIds.flatMap((id) => [
      fetch(`${BASE}/fixtures?team=${id}&next=3`, { headers: headers(), signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${BASE}/fixtures?team=${id}&last=3`, { headers: headers(), signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    const responses = await Promise.all(fetches);
    for (const json of responses) {
      const fixtures: ApiFixture[] = Array.isArray(json?.response)
        ? json.response
        : [];
      for (const f of fixtures) {
        const ev = normalize(f);
        if (!results.has(ev.id)) results.set(ev.id, ev);
      }
    }
  } catch {
    /* ignore */
  }

  return Array.from(results.values()).sort((a, b) => {
    const at = a.date ? Date.parse(a.date) : Infinity;
    const bt = b.date ? Date.parse(b.date) : Infinity;
    const now = Date.now();
    const af = at >= now ? 0 : 1;
    const bf = bt >= now ? 0 : 1;
    if (af !== bf) return af - bf;
    return Math.abs(at - now) - Math.abs(bt - now);
  });
}
