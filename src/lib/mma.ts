// TheSportsDB — promoções de MMA (UFC, KSW, Oktagon, Jungle Fight).
// Usa eventsnextleague.php para listar próximos cards com nome + data,
// em vez de buscar por lutador (que não funciona para MMA sem times).

import type { SportEvent } from "@/lib/sportsdb";

const BASE = "https://www.thesportsdb.com/api/v1/json/3";

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
  const res = await fetch(`${BASE}/eventsnextleague.php?id=${id}`, { signal });
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
  if (events.length > 0) promoCache.set("all", events);
  return events;
}

type MmaEvent = SportEvent & { _hay: string };

export async function searchMmaEvents(query: string, signal?: AbortSignal): Promise<SportEvent[]> {
  const q = normText(query);
  const events = await loadUpcoming(signal);
  const strip = (e: MmaEvent): SportEvent => {
    const { _hay, ...ev } = e;
    return ev;
  };
  if (q.length < 2) return events.map(strip);
  return events
    .filter((e) => e._hay.includes(q))
    .slice(0, 20)
    .map(strip);
}
