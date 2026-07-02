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

const normText = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** "Time A x Time B" / "A vs B" → [A, B]; senão null. */
function splitMatchup(q: string): [string, string] | null {
  const parts = q.split(/\s+(?:x|vs\.?)\s+/i);
  if (parts.length === 2 && parts[0].trim().length >= 3 && parts[1].trim().length >= 2) {
    return [parts[0].trim(), parts[1].trim()];
  }
  return null;
}

function matchesOpponent(ev: SportEvent, variants: string[]): boolean {
  const hay = normText([ev.name, ev.homeTeam ?? "", ev.awayTeam ?? ""].join(" "));
  return variants.some((v) => hay.includes(normText(v)));
}

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
  if (q.length < 3) return [];

  // "Time A x Time B": busca pelo time A e filtra os resultados pelo time B.
  // As APIs não entendem o confronto inteiro (muito menos em português).
  const matchup = splitMatchup(q);
  const teamPart = matchup ? matchup[0] : q;

  // PT → EN: as APIs indexam nomes em inglês ("Alemanha" não acha "Germany").
  const searchQ = translateQueryToEnglish(teamPart) ?? teamPart;
  const opponentVariants = matchup
    ? [matchup[1], translateQueryToEnglish(matchup[1]) ?? ""].filter(Boolean)
    : null;

  // Cache pela query EFETIVA (pós-tradução): "estados un", "estados uni"...
  // resolvem todos para "United States" e reutilizam a mesma entrada.
  const cacheKey = `${normText(searchQ)}|${matchup ? normText(matchup[1]) : ""}`;
  const cached = sportCache.get(cacheKey);
  if (cached) return cached;

  // Distingue "vazio de verdade" de "falha/rate limit": só o primeiro é cacheável.
  let hadError = false;
  const results = new Map<string, SportEvent>();

  // 1) Direct event-name search (só sem confronto — com confronto o nome do
  //    evento digitado está em PT e nunca casa com o índice EN).
  if (!matchup) {
    try {
      const res = await fetch(`${BASE}/searchevents.php?e=${encodeURIComponent(searchQ)}`, { signal });
      if (res.ok) {
        const json = await res.json();
        const arr: RawEvent[] = Array.isArray(json?.event) ? json.event : [];
        for (const raw of arr) {
          const ev = normalize(raw);
          if (!results.has(ev.id)) results.set(ev.id, ev);
        }
      } else {
        hadError = true;
      }
    } catch { hadError = true; }
  }

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
    } else {
      hadError = true;
    }
  } catch { hadError = true; }

  let list = Array.from(results.values());
  if (opponentVariants) list = list.filter((ev) => matchesOpponent(ev, opponentVariants));
  list = list
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
      let fallback = await searchEventsApiSports(searchQ, signal);
      if (opponentVariants) fallback = fallback.filter((ev) => matchesOpponent(ev, opponentVariants));
      list = fallback.slice(0, 15);
    } catch { hadError = true; }
  }

  // Cacheia não-vazios sempre; vazios só quando não houve falha de rede/rate
  // limit — um vazio legítimo repetido a cada tecla era o que drenava a quota.
  if (list.length > 0 || !hadError) {
    sportCache.set(cacheKey, list);
  }
  return list;
}
