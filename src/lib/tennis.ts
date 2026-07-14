// Matchstat Tennis API (ATP/WTA/ITF) via proxy Supabase Edge Function.
// Docs: https://tennisapidoc.matchstat.com/fixtures
// A chave do RapidAPI fica no Supabase Vault e é usada server-side pela função
// `tennis-fixtures` — nunca chega ao bundle do front.
import type { SportEvent } from "@/lib/sportsdb";
import { supabase } from "@/integrations/supabase/client";

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

type IndexedEvent = SportEvent & { _hay: string };
const fixturesCache = new Map<string, IndexedEvent[]>();
// Dedup de carga em voo: buscas concorrentes (keystrokes) compartilham a mesma
// paginação em vez de cada uma disparar 12 requests e estourar o rate limit.
const inflight = new Map<string, Promise<IndexedEvent[]>>();

// Teto de páginas por tour (proteção contra loop). pageSize=100 → até 600 fixtures/tour.
const MAX_PAGES = 6;

// complete=false apenas quando a paginação foi interrompida por erro (ex.: 429).
// Atingir o teto MAX_PAGES com hasNextPage ainda true conta como completo (corte intencional).
async function loadTour(type: "atp" | "wta", start: string, end: string): Promise<{ items: TennisFixture[]; complete: boolean }> {
  const all: TennisFixture[] = [];
  // A API pagina via pageNo (1-indexed) + hasNextPage. Sem isto pegávamos só os
  // 100 primeiros fixtures da janela (rodadas iniciais), perdendo jogos posteriores.
  // Sem AbortSignal aqui de propósito: a janela é carga compartilhada (ver loadWindow),
  // não pode ser cancelada pelo keystroke que a disparou.
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    // Proxy: a edge function injeta a chave (Vault) e devolve { ok, status, body }.
    const { data, error } = await supabase.functions.invoke("tennis-fixtures", {
      body: { type, start, end, pageNo },
    });
    // error = falha da função; ok:false = erro upstream (ex.: 429). Ambos = carga incompleta.
    if (error || !data?.ok) return { items: all, complete: false };
    const json = data.body;
    // Envelope pode vir como { data:[...], hasNextPage } ou { data:{ data:[...], hasNextPage } }.
    const page: TennisFixture[] = json?.data?.data ?? json?.data ?? [];
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    const hasNext = json?.data?.hasNextPage ?? json?.hasNextPage ?? false;
    if (!hasNext) break;
  }
  return { items: all, complete: true };
}

async function loadWindow(): Promise<IndexedEvent[]> {
  const now = new Date();
  const start = fmt(now);
  const end = fmt(new Date(now.getTime() + 14 * 864e5));
  const key = `${start}|${end}`;

  const cached = fixturesCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const [atp, wta] = await Promise.all([
      loadTour("atp", start, end),
      loadTour("wta", start, end),
    ]);

    const toEvent = (f: TennisFixture, tour: "ATP" | "WTA"): IndexedEvent => {
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
      ...atp.items.map((f) => toEvent(f, "ATP")),
      ...wta.items.map((f) => toEvent(f, "WTA")),
    ].filter((e) => e._hay.length > 1);

    // Debug: log da quantidade de eventos carregados
    console.log(`[Tennis] Loaded ${events.length} events (ATP: ${atp.items.length}, WTA: ${wta.items.length})`);

    // Só cacheia carga completa: evita fixar resultado parcial (ex.: página 1 após 429),
    // que deixaria jogadores de páginas seguintes sumidos pelo resto da sessão.
    if (events.length > 0 && atp.complete && wta.complete) fixturesCache.set(key, events);
    return events;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

// Respeita AbortSignal: evita retornar resultados obsoletos quando o usuário
// cancela a busca (ex.: ao editar aposta e mudar de esporte).
export async function searchTennisMatches(query: string, signal?: AbortSignal): Promise<SportEvent[]> {
  const q = normText(query);
  if (q.length < 3) return [];
  
  // Se já foi abortado, retorna vazio imediatamente
  if (signal?.aborted) return [];
  
  const fixtures = await loadWindow();
  
  // Verifica novamente após a carga (não foi cancelado enquanto esperava)
  if (signal?.aborted) return [];
  
  console.log(`[Tennis] Searching "${query}" (normalized: "${q}") in ${fixtures.length} fixtures`);
  
  const filtered = fixtures
    .filter((f) => f._hay.includes(q));
  
  console.log(`[Tennis] Found ${filtered.length} matches`);
  if (filtered.length > 0) {
    console.log(`[Tennis] Top 3 results:`, filtered.slice(0, 3).map(f => ({ name: f.name, hay: f._hay })));
  }
  
  return filtered
    .sort((a, b) => (a.date ? Date.parse(a.date) : Infinity) - (b.date ? Date.parse(b.date) : Infinity))
    .slice(0, 15)
    .map(({ _hay, ...ev }) => ev);
}
