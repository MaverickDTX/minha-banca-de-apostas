// MMA: busca multi-fonte com cache.
// 1. TheSportsDB promoções (UFC, KSW, Oktagon, Jungle Fight)
// 2. The Odds API (eventos futuros com odds)
// 3. API-Sports MMA (busca por lutador)
// Apenas respostas bem-sucedidas entram no cache, com validade limitada.

import type { SportEvent } from "@/lib/sportsdb";

// ---------- TheSportsDB (fonte primária) ----------
const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";

const MMA_PROMOTIONS: { id: string; label: string }[] = [
  { id: "4443", label: "UFC" },
  { id: "4709", label: "KSW" },
  { id: "5702", label: "Oktagon MMA" },
  { id: "4604", label: "Jungle Fight" },
];

type TsdbEvent = {
  idEvent: string;
  strEvent: string;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strLeague?: string;
  strSport?: string;
};

const normText = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const CACHE_TTL = 5 * 60_000;
const promoCache = new Map<string, { expires: number; events: TsdbEvent[] }>();

function toIso(e: TsdbEvent): string | null {
  if (e.strTimestamp) {
    const s = e.strTimestamp.includes("T") ? e.strTimestamp : e.strTimestamp.replace(" ", "T");
    return new Date(s.endsWith("Z") ? s : s + "Z").toISOString();
  }
  if (e.dateEvent) {
    const t = e.strTime && e.strTime !== "00:00:00" ? e.strTime : "00:00:00";
    return new Date(`${e.dateEvent}T${t}Z`).toISOString();
  }
  return null;
}

function splitFighters(strEvent: string): { home?: string; away?: string } {
  const parts = strEvent.split(/\s+vs\.?\s+|\s+x\s+/i);
  if (parts.length !== 2) return {};
  const home = parts[0].trim().replace(/^.*?(?:\d+|:)\s+/, "");
  const away = parts[1].trim().replace(/\s+\d+$/, "");
  return { home, away };
}

async function loadPromotion(id: string, signal?: AbortSignal): Promise<TsdbEvent[]> {
  const cached = promoCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.events;
  const res = await fetch(`${TSDB_BASE}/eventsnextleague.php?id=${id}`, { signal });
  if (!res.ok) throw new Error(`MMA schedule: ${res.status}`);
  const json = await res.json();
  const events = Array.isArray(json?.events) ? json.events : [];
  signal?.throwIfAborted();
  promoCache.set(id, { expires: Date.now() + CACHE_TTL, events });
  return events;
}

async function loadUpcoming(signal?: AbortSignal) {
  const lists = await Promise.all(
    MMA_PROMOTIONS.map((p) => loadPromotion(p.id, signal).catch(() => [])),
  );
  const events = lists.flat().map((e) => {
    const { home, away } = splitFighters(e.strEvent);
    return {
      id: `mma-${e.idEvent}`,
      name: e.strEvent.replace(/\s+vs\.?\s+/gi, " x "),
      sport: "MMA",
      league: e.strLeague ?? "MMA",
      date: toIso(e),
      homeTeam: home,
      awayTeam: away,
      _hay: normText(e.strEvent),
    };
  });
  events.sort(
    (a, b) => (a.date ? Date.parse(a.date) : Infinity) - (b.date ? Date.parse(b.date) : Infinity),
  );
  signal?.throwIfAborted();
  return events;
}

type MmaEvent = SportEvent & { _hay: string };

// ---------- The Odds API (fonte secundária, carregamento preguiçoso) ----------
const ODDS_KEY = import.meta.env.VITE_ODDS_API_KEY as string | undefined;
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const oddsGroupCache = new Map<string, { expires: number; events: SportEvent[] }>();

async function loadOddsEvents(signal?: AbortSignal): Promise<SportEvent[]> {
  const sportKey = "mma_mixed_martial_arts";
  const cached = oddsGroupCache.get(sportKey);
  if (cached && cached.expires > Date.now()) return cached.events;

  if (!ODDS_KEY) return [];

  const url = `${ODDS_BASE}/sports/${sportKey}/events?apiKey=${ODDS_KEY}`;
  let res: Response;
  try { res = await fetch(url, { signal }); } catch { signal?.throwIfAborted(); return []; }
  if (!res.ok) return [];
  const json: unknown = await res.json();
  const arr = Array.isArray(json) ? json : [];
  const events: SportEvent[] = arr.map((e: { id: string; commence_time: string; sport_title: string; home_team: string; away_team: string }) => ({
    id: `oddsapi-${e.id}`,
    name: `${e.home_team} x ${e.away_team}`,
    sport: "MMA",
    league: e.sport_title,
    date: new Date(e.commence_time).toISOString(),
    homeTeam: e.home_team,
    awayTeam: e.away_team,
  }));
  signal?.throwIfAborted();
  oddsGroupCache.set(sportKey, { expires: Date.now() + CACHE_TTL, events });
  return events;
}

// ---------- API-Sports MMA (fonte terciária) ----------
const APISPORTS_KEY = import.meta.env.VITE_API_SPORTS_KEY as string | undefined;

async function loadApisportsMma(query: string, signal?: AbortSignal): Promise<SportEvent[]> {
  if (!APISPORTS_KEY) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  let fighterId: number | null = null;
  try {
    const res = await fetch(
      `https://v1.mma.api-sports.io/fighters?search=${encodeURIComponent(q)}`,
      { headers: { "x-apisports-key": APISPORTS_KEY }, signal },
    );
    if (res.ok) {
      const json = await res.json();
      const fighters = Array.isArray(json?.response) ? json.response.slice(0, 1) : [];
      fighterId = fighters[0]?.id ?? null;
    }
  } catch { /* ignore */ }

  if (!fighterId) return [];

  const year = new Date().getFullYear();
  const seasons = [year, year - 1, year - 2, year - 3, year - 4];
  for (const s of seasons) {
    signal?.throwIfAborted();
    try {
      const res = await fetch(
        `https://v1.mma.api-sports.io/fights?fighter=${fighterId}&season=${s}`,
        { headers: { "x-apisports-key": APISPORTS_KEY }, signal },
      );
      if (!res.ok) continue;
      const json = await res.json();
      const fights = Array.isArray(json?.response) ? json.response : [];
      if (fights.length === 0) continue;
      return fights.map((f: { id: number; date: string; fighters: { first?: { name: string }; second?: { name: string } } }) => {
        const a = f.fighters.first?.name ?? "";
        const b = f.fighters.second?.name ?? "";
        return {
          id: `apisports-mma-${f.id}`,
          name: `${a} x ${b}`,
          sport: "MMA",
          league: "MMA",
          date: new Date(f.date).toISOString(),
          homeTeam: a,
          awayTeam: b,
        } satisfies SportEvent;
      });
    } catch { continue; }
  }
  return [];
}

// ---------- Busca principal (multi-fonte) ----------

function stripMma(e: MmaEvent): SportEvent {
  const { _hay, ...ev } = e;
  return ev;
}

function dedupeAndSort(list: SportEvent[], max?: number): SportEvent[] {
  const seen = new Set<string>();
  const deduped: SportEvent[] = [];
  for (const ev of list) {
    if (!seen.has(ev.id)) { seen.add(ev.id); deduped.push(ev); }
  }
  deduped.sort((a, b) => {
    const at = a.date ? Date.parse(a.date) : Infinity;
    const bt = b.date ? Date.parse(b.date) : Infinity;
    const now = Date.now();
    const af = at >= now ? 0 : 1;
    const bf = bt >= now ? 0 : 1;
    if (af !== bf) return af - bf;
    return Math.abs(at - now) - Math.abs(bt - now);
  });
  return max ? deduped.slice(0, max) : deduped;
}

export async function searchMmaEvents(
  query: string,
  signal?: AbortSignal,
  opts?: { includeAll?: boolean; fighterFallback?: boolean },
): Promise<SportEvent[]> {
  const q = normText(query);

  // 1. TheSportsDB (promoções)
  const [tsdbRaw, odds] = await Promise.all([
    loadUpcoming(signal),
    loadOddsEvents(signal).catch(() => [] as SportEvent[]),
  ]);
  signal?.throwIfAborted();

  // Fusiona TSDB + Odds (dedup por id)
  const merged = dedupeAndSort([...tsdbRaw.map(stripMma), ...odds]);

  // Se a fusão já tem resultados e a query tem ≥2 chars, filtra; senão retorna tudo
  if (q.length < 2) return opts?.includeAll ? merged : merged.slice(0, 20);

  const hayFn = (ev: SportEvent) =>
    normText([ev.homeTeam ?? "", ev.awayTeam ?? "", ev.name, ev.sport, ev.league].join(" "));

  const tokens = q.split(/\s+/).filter((token) => !["vs", "vs.", "x"].includes(token));
  let filtered = merged.filter((ev) => tokens.every((token) => hayFn(ev).includes(token)));

  // 3. Fallback: API-Sports MMA (busca por lutador). Só roda quando o MMA é o
  // esporte selecionado (fighterFallback !== false) — como fonte secundária de
  // outros esportes, toda query de futebol cairia aqui e dispararia
  // /fighters?search=<time> à toa.
  if (filtered.length === 0 && opts?.fighterFallback !== false) {
    try {
      const apisports = await loadApisportsMma(query, signal);
      filtered = dedupeAndSort(apisports, 20);
    } catch { /* opcional */ }
  }

  return filtered.slice(0, 20);
}
