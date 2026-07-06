// Matchstat Tennis API (ATP/WTA/ITF) via RapidAPI.
// Docs: https://tennisapidoc.matchstat.com/fixtures
// Nota: a chave VITE_TENNIS_RAPIDAPI_KEY fica exposta no bundle do front.
// O correto depois é proxy via Supabase Edge Function.

import type { SportEvent } from "@/lib/sportsdb";

const KEY = import.meta.env.VITE_TENNIS_RAPIDAPI_KEY as string | undefined;
const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;

function headers(): HeadersInit {
  return { "X-RapidAPI-Key": KEY ?? "", "X-RapidAPI-Host": HOST };
}

type TennisPlayer = { id: number; name: string; countryAcr?: string };
type TennisFixture = {
  id: number;
  date: string | null;
  player1?: TennisPlayer;
  player2?: TennisPlayer;
  tournamentId?: number;
};

const normText = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const fmt = (d: Date) => d.toISOString().slice(0, 10);

const fixturesCache = new Map<string, (SportEvent & { _hay: string })[]>();

async function loadTour(type: "atp" | "wta", start: string, end: string, signal?: AbortSignal): Promise<TennisFixture[]> {
  if (!KEY) return [];
  const url = `${BASE}/tennis/v2/${type}/fixtures/${start}/${end}?pageSize=100`;
  const res = await fetch(url, { headers: headers(), signal });
  if (!res.ok) return [];
  const json = await res.json();
  const arr: TennisFixture[] = json?.data?.data ?? json?.data ?? [];
  return Array.isArray(arr) ? arr : [];
}

async function loadWindow(signal?: AbortSignal) {
  const now = new Date();
  const start = fmt(now);
  const end = fmt(new Date(now.getTime() + 14 * 864e5));
  const key = `${start}|${end}`;
  const cached = fixturesCache.get(key);
  if (cached) return cached;

  const [atp, wta] = await Promise.all([
    loadTour("atp", start, end, signal),
    loadTour("wta", start, end, signal),
  ]);

  const toEvent = (f: TennisFixture, tour: "ATP" | "WTA") => {
    const p1 = f.player1?.name ?? "";
    const p2 = f.player2?.name ?? "";
    return {
      id: `tennis-${tour.toLowerCase()}-${f.id}`,
      name: `${p1} x ${p2}`.trim(),
      sport: "Tênis",
      league: tour,
      date: f.date ? new Date(f.date).toISOString() : null,
      homeTeam: p1 || undefined,
      awayTeam: p2 || undefined,
      _hay: normText(`${p1} ${p2}`),
    };
  };

  const events = [
    ...atp.map((f) => toEvent(f, "ATP")),
    ...wta.map((f) => toEvent(f, "WTA")),
  ].filter((e) => e._hay.length > 1);

  if (events.length > 0) fixturesCache.set(key, events);
  return events;
}

export async function searchTennisMatches(query: string, signal?: AbortSignal): Promise<SportEvent[]> {
  const q = normText(query);
  if (q.length < 3) return [];
  const fixtures = await loadWindow(signal);
  return fixtures
    .filter((f) => f._hay.includes(q))
    .sort((a, b) => (a.date ? Date.parse(a.date) : Infinity) - (b.date ? Date.parse(b.date) : Infinity))
    .slice(0, 15)
    .map(({ _hay, ...ev }) => ev);
}
