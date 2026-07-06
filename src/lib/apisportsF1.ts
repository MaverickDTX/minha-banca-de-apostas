// Jolpica-F1 (sucessora da Ergast) — fonte gratuita de dados de F1 (Apache-2.0).
// Docs: https://api.jolpi.ca/
// Rate limit: ~200 req/h sem auth. Cachear o calendário por ano cobre o uso.
// Uso comercial permitido.

import type { SportEvent } from "@/lib/sportsdb";

const JOLPICA = "https://api.jolpi.ca/ergast/f1";

type ErgastRace = {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit?: {
    circuitId?: string;
    circuitName?: string;
    Location?: { locality?: string; country?: string };
  };
};

const seasonCache = new Map<number, (SportEvent & { _hay: string })[]>();

const normText = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

const GP_PT: Record<string, string> = {
  albert_park: "GP da Austrália", shanghai: "GP da China", suzuka: "GP do Japão",
  miami: "GP de Miami", villeneuve: "GP do Canadá", monaco: "GP de Mônaco",
  catalunya: "GP de Barcelona", madring: "GP da Espanha", red_bull_ring: "GP da Áustria",
  silverstone: "GP da Grã-Bretanha", spa: "GP da Bélgica", hungaroring: "GP da Hungria",
  zandvoort: "GP dos Países Baixos", monza: "GP da Itália", baku: "GP do Azerbaijão",
  marina_bay: "GP de Singapura", americas: "GP dos Estados Unidos",
  rodriguez: "GP da Cidade do México", interlagos: "GP do Brasil",
  vegas: "GP de Las Vegas", losail: "GP do Catar", yas_marina: "GP de Abu Dhabi",
};

const COUNTRY_PT: Record<string, string> = {
  Australia: "GP da Austrália", China: "GP da China", Japan: "GP do Japão",
  USA: "GP dos Estados Unidos", Canada: "GP do Canadá", Monaco: "GP de Mônaco",
  Spain: "GP da Espanha", Austria: "GP da Áustria", UK: "GP da Grã-Bretanha",
  Belgium: "GP da Bélgica", Hungary: "GP da Hungria", Netherlands: "GP dos Países Baixos",
  Italy: "GP da Itália", Azerbaijan: "GP do Azerbaijão", Singapore: "GP de Singapura",
  Mexico: "GP do México", Brazil: "GP do Brasil", Qatar: "GP do Catar",
  UAE: "GP de Abu Dhabi", France: "GP da França", Germany: "GP da Alemanha",
  "Saudi Arabia": "GP da Arábia Saudita", Portugal: "GP de Portugal", Turkey: "GP da Turquia",
};

const PT_EN: Record<string, string> = {
  "brasil": "brazil", "estados unidos": "usa", "eua": "usa",
  "reino unido": "uk", "inglaterra": "uk", "gra bretanha": "uk",
  "emirados arabes unidos": "uae", "abu dhabi": "abu dhabi",
  "espanha": "spain", "italia": "italy", "franca": "france", "alemanha": "germany",
  "japao": "japan", "holanda": "netherlands", "paises baixos": "netherlands",
  "belgica": "belgium", "hungria": "hungary", "austria": "austria",
  "mexico": "mexico", "cidade do mexico": "mexico city", "canada": "canada",
  "arabia saudita": "saudi arabia", "catar": "qatar", "azerbaijao": "azerbaijan",
  "singapura": "singapore", "cingapura": "singapore", "china": "china",
  "australia": "australia", "holandes": "netherlands",
  "portugal": "portugal", "turquia": "turkey", "marrocos": "morocco",
  "coreia do sul": "korea", "india": "india", "russia": "russia",
  "bahrein": "bahrain", "barein": "bahrain", "las vegas": "las vegas",
  "miami": "miami",
};

async function loadSeason(year: number, signal?: AbortSignal) {
  const cached = seasonCache.get(year);
  if (cached) return cached;
  const res = await fetch(`${JOLPICA}/${year}/races/?format=json&limit=30`, { signal });
  if (!res.ok) return [];
  const json = await res.json();
  const races: ErgastRace[] = json?.MRData?.RaceTable?.Races ?? [];
  const events = races.map((r) => {
    const loc = r.Circuit?.Location;
    const iso = r.date ? new Date(`${r.date}T${r.time ?? "00:00:00Z"}`).toISOString() : null;
    const cid = r.Circuit?.circuitId ?? "";
    const ptName = GP_PT[cid] ?? COUNTRY_PT[loc?.country ?? ""] ?? r.raceName;
    return {
      id: `f1-${r.season}-${r.round}`,
      name: ptName,
      sport: "Formula 1",
      league: "Fórmula 1",
      date: iso,
      _hay: normText(
        [ptName, r.raceName, cid, r.Circuit?.circuitName, loc?.locality, loc?.country]
          .filter(Boolean).join(" ")
      ),
    };
  });
  if (events.length > 0) seasonCache.set(year, events);
  return events;
}

export async function searchF1Races(
  query: string,
  signal?: AbortSignal,
  opts?: { includeAll?: boolean },
): Promise<SportEvent[]> {
  const includeAll = opts?.includeAll ?? true;
  const q = normText(query);
  if (q.length < 3) return [];
  const qEn = PT_EN[q] ?? q;
  const year = new Date().getFullYear();

  let races = await loadSeason(year, signal);
  if (races.length === 0) races = await loadSeason(year - 1, signal);

  const generic = includeAll && (["f1", "formula", "formula 1", "formula1", "grand prix", "grande premio"].includes(q) || q.length < 4);
  return races
    .filter((r) => generic || r._hay.includes(q) || r._hay.includes(qEn))
    .sort((a, b) => (a.date ? Date.parse(a.date) : Infinity) - (b.date ? Date.parse(b.date) : Infinity))
    .slice(0, 15)
    .map(({ _hay, ...ev }) => ev);
}
