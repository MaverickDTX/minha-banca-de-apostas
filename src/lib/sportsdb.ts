// TheSportsDB free API (test key "3"). Search events by name/team.
// Docs: https://www.thesportsdb.com/free_sports_api

const KEY = "3";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

import { translateEventName, translateLeague, translateTeamName, translateQueryToEnglish } from "@/lib/translate";
import { searchEventsApiSports } from "@/lib/apisports";

export type SportEvent = {
  id: string;
  name: string;           // e.g. "Uruguay vs Brazil"
  sport: string;          // e.g. "Soccer"
  league: string;         // e.g. "FIFA World Cup Qualifiers - CONMEBOL"
  date: string | null;    // ISO string (UTC) when available
  homeTeam?: string;
  awayTeam?: string;
};

type RawEvent = {
  idEvent: string;
  strEvent: string;
  strSport?: string;
  strLeague?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  dateEvent?: string | null;       // YYYY-MM-DD (local league date)
  strTime?: string | null;         // HH:MM:SS (UTC)
  strTimestamp?: string | null;    // ISO-ish "YYYY-MM-DDTHH:MM:SS"
};

function toIso(e: RawEvent): string | null {
  if (e.strTimestamp) {
    // strTimestamp is UTC per docs but lacks "Z"
    const s = e.strTimestamp.includes("T") ? e.strTimestamp : e.strTimestamp.replace(" ", "T");
    return new Date(s + "Z").toISOString();
  }
  if (e.dateEvent) {
    const t = e.strTime && e.strTime !== "00:00:00" ? e.strTime : "00:00:00";
    return new Date(`${e.dateEvent}T${t}Z`).toISOString();
  }
  return null;
}

function normalize(e: RawEvent): SportEvent {
  const home = translateTeamName(e.strHomeTeam ?? undefined);
  const away = translateTeamName(e.strAwayTeam ?? undefined);
  return {
    id: e.idEvent,
    name: translateEventName(e.strEvent, e.strHomeTeam ?? undefined, e.strAwayTeam ?? undefined),
    sport: e.strSport ?? "",
    league: translateLeague(e.strLeague ?? ""),
    date: toIso(e),
    homeTeam: home,
    awayTeam: away,
  };
}

const sportCache = new Map<string, SportEvent[]>();

/** Map TheSportsDB/API-Sports sport string to the in-app sport label (PT-BR). */
const SPORT_LABELS: Record<string, string> = {
  soccer: "Futebol",
  football: "Futebol",
  basketball: "Basquete",
  tennis: "Tênis",
  mma: "MMA",
  fighting: "MMA",
  "mixed martial arts": "MMA",
  boxing: "Boxe",
  esports: "eSports",
  "american football": "Futebol Americano",
  nfl: "Futebol Americano",
  volleyball: "Vôlei",
  handball: "Handebol",
  "ice hockey": "Hóquei no Gelo",
  hockey: "Hóquei no Gelo",
  "field hockey": "Hóquei na Grama",
  baseball: "Beisebol",
  rugby: "Rúgbi",
  golf: "Golfe",
  motorsport: "Automobilismo",
  "motor sport": "Automobilismo",
  cricket: "Críquete",
  darts: "Dardos",
  snooker: "Sinuca",
  "table tennis": "Tênis de Mesa",
  "water polo": "Polo Aquático",
  cycling: "Ciclismo",
  athletics: "Atletismo",
  badminton: "Badminton",
  "australian football": "Futebol Australiano",
};

export function mapSportLabel(strSport: string): string {
  return SPORT_LABELS[strSport.trim().toLowerCase()] ?? (strSport || "Outro");
}

/**
 * Search upcoming/recent events by event name OR team name.
 * Combines `searchevents` (event-name match) with `searchteams` + `eventsnext`
 * to also surface games when the user types just a team/country.
 */
export async function searchEvents(query: string, signal?: AbortSignal): Promise<SportEvent[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const cached = sportCache.get(q.toLowerCase());
  if (cached) return cached;

  // PT → EN: as APIs indexam nomes em inglês ("Alemanha" não acha "Germany").
  // Cache continua chaveado pela query original digitada.
  const searchQ = translateQueryToEnglish(q) ?? q;

  const results = new Map<string, SportEvent>();

  // 1) Direct event-name search.
  try {
    const res = await fetch(`${BASE}/searchevents.php?e=${encodeURIComponent(searchQ)}`, { signal });
    if (res.ok) {
      const json = await res.json();
      const arr: RawEvent[] = Array.isArray(json?.event) ? json.event : [];
      for (const raw of arr) {
        const ev = normalize(raw);
        if (!results.has(ev.id)) results.set(ev.id, ev);
      }
    }
  } catch { /* ignore */ }

  // 2) Team search → next 5 AND last 5 matches for the best team hit.
  //    "Next" covers upcoming games; "last" covers recently played ones, so
  //    bets logged after the fact can still be autocompleted.
  //    Limited to 1 team to stay within TheSportsDB free tier (30 req/min).
  try {
    const res = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(searchQ)}`, { signal });
    if (res.ok) {
      const json = await res.json();
      const teams: { idTeam: string }[] = Array.isArray(json?.teams) ? json.teams.slice(0, 1) : [];
      const [nexts, lasts] = await Promise.all([
        Promise.all(
          teams.map((t) =>
            fetch(`${BASE}/eventsnext.php?id=${t.idTeam}`, { signal })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        ),
        Promise.all(
          teams.map((t) =>
            fetch(`${BASE}/eventslast.php?id=${t.idTeam}`, { signal })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        ),
      ]);
      for (const j of [...nexts, ...lasts]) {
        const arr: RawEvent[] = Array.isArray(j?.events) ? j.events : Array.isArray(j?.results) ? j.results : [];
        for (const raw of arr) {
          const ev = normalize(raw);
          if (!results.has(ev.id)) results.set(ev.id, ev);
        }
      }
    }
  } catch { /* ignore */ }

  let list = Array.from(results.values())
    .sort((a, b) => {
      const at = a.date ? Date.parse(a.date) : Infinity;
      const bt = b.date ? Date.parse(b.date) : Infinity;
      // future first (closest), then past
      const now = Date.now();
      const af = at >= now ? 0 : 1;
      const bf = bt >= now ? 0 : 1;
      if (af !== bf) return af - bf;
      return Math.abs(at - now) - Math.abs(bt - now);
    })
    .slice(0, 15);

  // Fallback: if TheSportsDB returned nothing, try API-Sports (football only).
  if (list.length === 0) {
    try {
      const fallback = await searchEventsApiSports(searchQ, signal);
      list = fallback.slice(0, 15);
    } catch { /* ignore */ }
  }

  // Only cache non-empty results so failed/empty searches can be retried.
  if (list.length > 0) {
    sportCache.set(q.toLowerCase(), list);
  }
  return list;
}
