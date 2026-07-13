// MMA: busca multi-fonte com cache.
// 1. TheSportsDB promoções (UFC, KSW, Oktagon, Jungle Fight)
// 2. The Odds API (eventos futuros com odds)
// 3. API-Sports MMA (busca por lutador)
// O cache é armazenado mesmo vazio (evita re-fetch infinito).

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

const promoCache = new Map<string, (SportEvent & { _hay: string })[]>();

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
  const left = parts[0].trim().split(/\s+/);
  const home = left.slice(-1)[0];
  const away = parts[1].trim().replace(/\s+\d+$/, "");
  return { home, away };
}

async function loadPromotion(id: string, signal?: AbortSignal): Promise<TsdbEvent[]> {
  const res = await fetch(`${TSDB_BASE}/eventsnextleague.php?id=${id}`, { signal });
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.events) ? json.events : [];
}

async function loadUpcoming(signal?: AbortSignal) {
  const cached = promoCache.get("all");
  if (cached) return cached;

  const lists = await Promise.all(
    MMA_PROMOTIONS.map((p) => loadPromotion(p.id, signal).catch(() => [])),
  );
  const events = lists.flat().map((e) => {
    const { home, away } = splitFighters(e.strEvent);
    return {
      id: `mma-${e.idEvent}`,
      name: e.strEvent,
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
  promoCache.set("all", events); // cache mesmo vazio — evita re-fetch
  return events;
}

type MmaEvent = SportEvent & { _hay: string };

// ---------- The Odds API (fonte secundária, carregamento preguiçoso) ----------
const ODDS_KEY = import.meta.env.VITE_ODDS_API_KEY as string | undefined;
const ODDS_BASE = "https://api.the-odds-api.com/v4";
const oddsGroupCache = new Map<string, SportEvent[]>();

async function loadOddsEvents(signal?: AbortSignal): Promise<SportEvent[]> {
  const sportKey = "mma_mixed_martial_arts";
  const cached = oddsGroupCache.get(sportKey);
  if (cached) return cached;

  if (!ODDS_KEY) { oddsGroupCache.set(sportKey, []); return []; }

  const url = `${ODDS_BASE}/sports/${sportKey}/odds?regions=us&markets=h2h&apiKey=${ODDS_KEY}`;
  let res: Response;
  try { res = await fetch(url, { signal }); } catch { oddsGroupCache.set(sportKey, []); return []; }
  if (!res.ok) { oddsGroupCache.set(sportKey, []); return []; }
  const json: unknown = await res.json();
  const arr = Array.isArray(json) ? json : [];
  const events: SportEvent[] = arr.map((e: { id: string; commence_time: string; sport_title: string; home_team: string; away_team: string }) => ({
    id: `oddsapi-${e.id}`,
    name: `${e.home_team} vs ${e.away_team}`,
    sport: "MMA",
    league: e.sport_title,
    date: new Date(e.commence_time).toISOString(),
    homeTeam: e.home_team,
    awayTeam: e.away_team,
  }));
  oddsGroupCache.set(sportKey, events);
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

  const seasons = [new Date().getFullYear() - 2, new Date().getFullYear() - 3, new Date().getFullYear() - 4];
  for (const s of seasons) {
    try {
      const res = await fetch(
        `https://v1.mma.api-sports.io/fights?fighter=${fighterId}&season=${s}`,
        { headers: { "x-apisports-key": APISPORTS_KEY }, signal },
      );
      if (!res.ok) continue;
      const json = await res.json();
      const fights = Array.isArray(json?.response) ? json.response : [];
      if (fights.length === 0) continue;
      return fights.map((f: { id: number; date: string; fighters: { fighter: { id: number; name: string } }[] }) => {
        const a = f.fighters[0]?.fighter.name ?? "";
        const b = f.fighters[1]?.fighter.name ?? "";
        return {
          id: `apisports-mma-${f.id}`,
          name: `${a} vs ${b}`,
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
  const tsdbRaw = await loadUpcoming(signal);

  // 2. The Odds API (sempre tenta, como fallback)
  let odds: SportEvent[] = [];
  try { odds = await loadOddsEvents(signal); } catch { /* opcional */ }

  // Fusiona TSDB + Odds (dedup por id)
  const merged = dedupeAndSort([...tsdbRaw.map(stripMma), ...odds]);

  // Se a fusão já tem resultados e a query tem ≥2 chars, filtra; senão retorna tudo
  if (q.length < 2) return opts?.includeAll ? merged : merged.slice(0, 20);

  const hayFn = (ev: SportEvent) =>
    normText([ev.homeTeam ?? "", ev.awayTeam ?? "", ev.name, ev.sport, ev.league].join(" "));

  let filtered = merged.slice(0, 40).filter((ev) => hayFn(ev).includes(q));

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
