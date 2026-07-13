// TheSportsDB free API (test key "3"). Search events by name/team.
// Docs: https://www.thesportsdb.com/free_sports_api

const KEY = "3";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

import { translateEventName, translateLeague, translateTeamName, translateQueryToEnglish } from "@/lib/translate";
import { searchEventsBySport, hasApiProduct, shouldTryTheSportsDbFirst } from "@/lib/apisportsMulti";
import { searchF1Races } from "@/lib/apisportsF1";
import { searchTennisMatches } from "@/lib/tennis";
import { searchMmaEvents } from "@/lib/mma";

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
  "formula 1": "Automobilismo",
  "formula-1": "Automobilismo",
  f1: "Automobilismo",
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
export async function searchEvents(query: string, signal?: AbortSignal, sport?: string): Promise<SportEvent[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const rawLabel = (sport ?? "").trim().toLowerCase();
  // sport da UI já vem em PT-BR (ex.: "Automobilismo"). Se for uma chave
  // conhecida do registry API-Sports, usa direto; senão passa pelo mapSportLabel
  // para converter de inglês (TheSportsDB) → PT-BR.
  const label = hasApiProduct(rawLabel) ? rawLabel : mapSportLabel(sport ?? "");

  // Tênis: Matchstat via proxy (edge function tennis-fixtures); fallback TheSportsDB (cobertura fraca)
  if (rawLabel === "tênis") {
    const tennis = await searchTennisMatches(q, signal);
    if (tennis.length > 0) return tennis;
  }

  // MMA: busca multi-fonte (TheSportsDB → Odds API → API-Sports), com fallbacks
  // interna já tratados pelo searchMmaEvents.
  let mmaPartial: SportEvent[] = [];
  if (rawLabel === "mma") {
    mmaPartial = await searchMmaEvents(q, signal);
    if (mmaPartial.length >= 2) return mmaPartial; // primário resolveu → retorna cedo
    // senão cai no fluxo abaixo onde TheSportsDB genérico pode achar lutas extras
  }

  // F1 primária: rotear direto ao adapter Jolpica
  if (label === "automobilismo") {
    return searchEventsBySport(q, signal, label);
  }

  // "Time A x Time B": busca pelo time A e filtra os resultados pelo time B.
  const matchup = splitMatchup(q);
  const teamPart = matchup ? matchup[0] : q;

  const searchQ = translateQueryToEnglish(teamPart) ?? teamPart;
  const opponentVariants = matchup
    ? [matchup[1], translateQueryToEnglish(matchup[1]) ?? ""].filter(Boolean)
    : null;

  const cacheKey = `${label}|${normText(searchQ)}|${matchup ? normText(matchup[1]) : ""}`;
  const cached = sportCache.get(cacheKey);
  if (cached) return cached;

  let hadError = false;
  const results = new Map<string, SportEvent>();

  // Injeta resultados parciais do MMA (quando o early return não disparou)
  for (const ev of mmaPartial) results.set(ev.id, ev);

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

  // F1 como fonte secundária em qualquer esporte (1 request cacheado, filtro client-side)
  if (label !== "automobilismo") {
    try {
      const f1 = await searchF1Races(q, signal, { includeAll: false });
      for (const ev of f1) if (!results.has(ev.id)) results.set(ev.id, ev);
    } catch { /* F1 opcional */ }
  }

  // Tênis como fonte secundária em qualquer esporte (Matchstat, se houver chave)
  if (rawLabel !== "tênis") {
    try {
      const tennis = await searchTennisMatches(q, signal);
      for (const ev of tennis) if (!results.has(ev.id)) results.set(ev.id, ev);
    } catch { /* Tênis opcional */ }
  }

  // MMA como fonte secundária em qualquer esporte — só TheSportsDB + Odds API
  // (cacheados); fighterFallback: false evita busca de lutadores na API-Sports
  // para queries de outros esportes.
  if (rawLabel !== "mma") {
    try {
      const mma = await searchMmaEvents(q, signal, { fighterFallback: false });
      for (const ev of mma) if (!results.has(ev.id)) results.set(ev.id, ev);
    } catch { /* MMA opcional */ }
  }

  let list = Array.from(results.values());
  if (opponentVariants) list = list.filter((ev) => matchesOpponent(ev, opponentVariants));
  list = list
    .sort((a, b) => {
      const at = a.date ? Date.parse(a.date) : Infinity;
      const bt = b.date ? Date.parse(b.date) : Infinity;
      const now = Date.now();
      const af = at >= now ? 0 : 1;
      const bf = bt >= now ? 0 : 1;
      if (af !== bf) return af - bf;
      return Math.abs(at - now) - Math.abs(bt - now);
    })
    .slice(0, 15);

  // Fallback: TheSportsDB vazio → tenta API-Sports (só para esportes sem TSDB)
  if (list.length === 0 && hasApiProduct(label) && !shouldTryTheSportsDbFirst(label)) {
    try {
      let fallback = await searchEventsBySport(q, signal, label);
      if (opponentVariants) fallback = fallback.filter((ev) => matchesOpponent(ev, opponentVariants));
      list = fallback.slice(0, 15);
    } catch { hadError = true; }
  }

  if (list.length > 0 || !hadError) {
    sportCache.set(cacheKey, list);
  }
  return list;
}
