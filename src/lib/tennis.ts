// Matchstat Tennis API (ATP/WTA/ITF) via proxy Supabase Edge Function.
// Docs: https://tennisapidoc.matchstat.com/fixtures
// A chave do RapidAPI fica no Supabase Vault e é usada server-side pela função
// `tennis-fixtures` — nunca chega ao bundle do front.
import type { SportEvent } from "@/lib/sportsdb";
import { supabase } from "@/integrations/supabase/client";
import { parseFlashscoreMatches, tennisPlayerIdsFromSearch } from "@/lib/flashscore";

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

export function matchesTennisQuery(haystack: string, query: string): boolean {
  const q = normText(query);
  const players = q.split(/\s+(?:x|vs\.?)\s+/i).filter(Boolean);

  // O índice guarda apenas os nomes dos jogadores. Por isso, numa busca de
  // confronto, não podemos exigir que ele também contenha o separador "x"/"vs".
  if (players.length === 2) return players.every((player) => haystack.includes(player));
  return haystack.includes(q);
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

type IndexedEvent = SportEvent & { _hay: string };
type WindowResult = { events: IndexedEvent[]; complete: boolean };
// Só cargas COMPLETAS entram no cache, logo todo hit é { complete: true }.
const fixturesCache = new Map<string, IndexedEvent[]>();
// Dedup de carga em voo: buscas concorrentes (keystrokes) compartilham a mesma
// paginação em vez de cada uma disparar a cascata de requests em paralelo.
const inflight = new Map<string, Promise<WindowResult>>();

// Teto de páginas por tour e janela (proteção contra loop). pageSize=100 → até
// 300 fixtures/tour/janela; mantém o autocomplete responsivo mesmo incluindo ITF.
const MAX_PAGES = 3;
const TOURS = ["atp", "wta", "itf"] as const;
type Tour = typeof TOURS[number];

// Circuit breaker: quando o Matchstat devolve 429 (cota DIÁRIA), ele seguirá
// devolvendo 429 por horas — e, na RapidAPI, cada 429 CONTA contra a cota.
// Por isso: (a) NÃO há retry em 429; (b) o breaker é consultado antes de cada
// página e de cada tour, então o primeiro 429 encerra toda a cascata da busca
// corrente, não só as buscas futuras. Passado o cooldown, tenta de novo.
const COOLDOWN_MS = 10 * 60 * 1000; // 10 min
let matchstatBlockedUntil = 0;
const matchstatBlocked = () => Date.now() < matchstatBlockedUntil;
const tripMatchstatBreaker = () => { matchstatBlockedUntil = Date.now() + COOLDOWN_MS; };
// Reset do breaker — usado só em testes (estado de módulo persiste entre casos).
export const __resetMatchstatBreaker = () => { matchstatBlockedUntil = 0; };

type Envelope = { ok?: boolean; status?: number; body?: unknown } | null;
type FixturesPage = {
  data?: TennisFixture[] | { data?: TennisFixture[]; hasNextPage?: boolean };
  hasNextPage?: boolean;
};

// complete=false quando a paginação foi interrompida por QUALQUER falha (429,
// 5xx, timeout da edge function, erro do invoke) ou pelo breaker já armado.
// Atingir o teto MAX_PAGES com hasNextPage ainda true conta como completo
// (corte intencional). Qualquer carga incompleta habilita o fallback na UI —
// condicionar o fallback só ao 429 deixava timeouts sem nenhuma fonte.
async function loadTour(type: Tour, start: string, end: string): Promise<{ items: TennisFixture[]; complete: boolean }> {
  const all: TennisFixture[] = [];
  // A API pagina via pageNo (1-indexed) + hasNextPage. Sem isto pegávamos só os
  // 100 primeiros fixtures da janela (rodadas iniciais), perdendo jogos posteriores.
  // Sem AbortSignal aqui de propósito: a janela é carga compartilhada (ver loadWindow),
  // não pode ser cancelada pelo keystroke que a disparou.
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    // Breaker consultado POR PÁGINA: um 429 em outra chamada concorrente
    // interrompe esta paginação imediatamente, sem gastar mais cota.
    if (matchstatBlocked()) return { items: all, complete: false };
    // Proxy: a edge function injeta a chave (Vault) e devolve { ok, status, body }.
    const response = await supabase.functions.invoke("tennis-fixtures", {
      body: { type, start, end, pageNo },
    });
    const data = response.data as Envelope;
    if (data?.status === 429) {
      // Cota esgotada: arma o breaker e desiste JÁ — retry em cota diária é
      // gasto puro (cada 429 também debita da cota na RapidAPI).
      tripMatchstatBreaker();
      return { items: all, complete: false };
    }
    // error = falha da função (inclui timeout); ok:false = erro upstream não-429.
    if (response.error || !data?.ok) return { items: all, complete: false };
    const json = data.body as FixturesPage | null;
    const inner = json?.data;
    // Envelope pode vir como { data:[...], hasNextPage } ou { data:{ data:[...], hasNextPage } }.
    const page: TennisFixture[] = Array.isArray(inner) ? inner : inner?.data ?? [];
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    const hasNext = (Array.isArray(inner) ? json?.hasNextPage : inner?.hasNextPage) ?? false;
    if (!hasNext) break;
  }
  return { items: all, complete: true };
}

async function loadWindow(start: string, end: string): Promise<WindowResult> {
  const key = `${start}|${end}`;

  const cached = fixturesCache.get(key);
  if (cached) return { events: cached, complete: true };

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async (): Promise<WindowResult> => {
    // Consultar ATP, WTA e ITF em sequência evita que a primeira digitação
    // consuma todo o limite de taxa do provedor.
    const tours: Array<{ items: TennisFixture[]; complete: boolean }> = [];
    for (const tour of TOURS) {
      // Breaker consultado POR TOUR: 429 no ATP não deixa WTA/ITF gastarem cota.
      if (matchstatBlocked()) {
        tours.push({ items: [], complete: false });
        continue;
      }
      tours.push(await loadTour(tour, start, end));
    }

    const toEvent = (f: TennisFixture, tour: string): IndexedEvent => {
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

    const events = tours.flatMap((result, index) =>
      result.items.map((f) => toEvent(f, TOURS[index].toUpperCase())),
    ).filter((e) => e._hay.length > 1);

    const complete = tours.every((tour) => tour.complete);
    // Só cacheia carga completa: evita fixar resultado parcial (ex.: página 1 após 429),
    // que deixaria jogadores de páginas seguintes sumidos pelo resto da sessão.
    if (events.length > 0 && complete) fixturesCache.set(key, events);
    return { events, complete };
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

// ---- Fallback Flashscore4 --------------------------------------------------
// Cadeia search → results/fixtures via proxy (modo provider:"flashscore").
// Usado só quando o Matchstat falha (429/erro/timeout). Cada busca = ~2 req
// (search + results) ou ~3 com fixtures; cota Flashscore é 500/mês, então usar
// só como fallback pontual. Função PURA de I/O não é — depende do supabase.functions.

async function fsFetch(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await supabase.functions.invoke("tennis-fixtures", {
    body: { provider: "flashscore", path },
  });
  if (response.error) return { ok: false, status: 502, body: null };
  const data = response.data as Envelope;
  return { ok: data?.ok ?? false, status: data?.status ?? 502, body: data?.body ?? null };
}

// Teto de jogadores candidatos vindos do search. 3 (e não 5): cada candidato
// custa 2 requests da cota mensal de 500; o jogador certo quase sempre está
// entre os 3 primeiros por relevância do próprio Flashscore.
const FS_MAX_PLAYERS = 3;

async function searchTennisFlashscore(query: string): Promise<SportEvent[]> {
  const q = normText(query);
  const search = await fsFetch(`/api/flashscore/v2/general/search?q=${encodeURIComponent(query)}`);
  if (!search.ok) return [];
  const ids = tennisPlayerIdsFromSearch(search.body).slice(0, FS_MAX_PLAYERS);
  if (ids.length === 0) return [];

  // O Flashscore devolve nomes ABREVIADOS ("Jade D."), então a heurística de
  // confronto do primário (substring do nome completo) não casa. Casa por
  // SOBRENOME: para "A x B", exige os sobrenomes de ambos no evento; para nome
  // único, exige o sobrenome do jogador buscado (o search já filtrou o jogador).
  const sides = q.split(/\s+(?:x|vs\.?)\s+/i).filter(Boolean);
  const surnames = sides.map((s) => s.split(/\s+/).pop() ?? s).filter(Boolean);
  const matchEvent = (ev: SportEvent): boolean => {
    const hay = normText(`${ev.homeTeam ?? ""} ${ev.awayTeam ?? ""}`);
    return surnames.every((s) => hay.includes(s));
  };

  const events: SportEvent[] = [];
  for (const id of ids) {
    // Histórico (results) + futuros (fixtures); mesmo shape do Flashscore.
    const [results, fixtures] = await Promise.all([
      fsFetch(`/api/flashscore/v2/players/tennis/results?player_id=${id}&type=singles&page=1`),
      fsFetch(`/api/flashscore/v2/players/tennis/fixtures?player_id=${id}&page=1`),
    ]);
    if (results.ok) events.push(...parseFlashscoreMatches(results.body));
    if (fixtures.ok) events.push(...parseFlashscoreMatches(fixtures.body));
    // Só para quando já há evento que SATISFAZ o filtro de confronto — não no
    // primeiro jogador que tenha qualquer jogo. Para "A x B", o confronto pode
    // estar sob o player_id de B mesmo que A (primeiro id) tenha outros jogos.
    if (events.some(matchEvent)) break;
  }

  return events
    .filter(matchEvent)
    .sort((a, b) => (a.date ? Date.parse(a.date) : Infinity) - (b.date ? Date.parse(b.date) : Infinity))
    .slice(0, 15);
}

// signal ignorado de propósito: a janela é carga compartilhada/cacheada e não deve
// ser cancelada por um keystroke. O componente descarta resultados obsoletos via
// ctrl.signal.aborted antes de renderizar.
export async function searchTennisMatches(
  query: string,
  _signal?: AbortSignal,
  opts?: { allowFlashscore?: boolean },
): Promise<SportEvent[]> {
  // allowFlashscore só é true na busca PRIMÁRIA de tênis. Quando o tênis roda
  // como fonte SECUNDÁRIA (futebol/MMA/etc.), não gastar cota do Flashscore com
  // uma query que nem é de tênis — e, com o breaker armado, retornar cedo e vazio.
  const allowFlashscore = opts?.allowFlashscore ?? false;
  const q = normText(query);
  if (q.length < 3) return [];
  const now = new Date();
  const filterAndSort = (fixtures: IndexedEvent[]) => fixtures
    .filter((fixture) => matchesTennisQuery(fixture._hay, q))
    .sort((a, b) => (a.date ? Date.parse(a.date) : Infinity) - (b.date ? Date.parse(b.date) : Infinity))
    .slice(0, 15)
    .map(({ _hay, ...ev }) => ev);

  // Circuit breaker: se o Matchstat já devolveu 429 recentemente (cota diária),
  // vai direto ao fallback sem tocar o primário. Isso mantém responsivas TODAS
  // as buscas, inclusive futebol/MMA que chamam o tênis como fonte secundária.
  // Passado o cooldown, o fluxo normal volta a tentar o primário.
  if (matchstatBlocked()) {
    if (!allowFlashscore) return []; // fonte secundária: não gasta cota do Flashscore
    return searchTennisFlashscore(query);
  }

  // Consulta os jogos passados primeiro e só chama a agenda futura quando não
  // houver resultado. Assim cobre histórico sem disparar todas as consultas de
  // uma vez, o que faz o RapidAPI responder 429.
  const recent = await loadWindow(
    fmt(new Date(now.getTime() - 30 * 864e5)),
    fmt(new Date(now.getTime() - 864e5)),
  );
  const recentMatches = filterAndSort(recent.events);
  if (recentMatches.length > 0) return recentMatches;

  const upcoming = await loadWindow(fmt(now), fmt(new Date(now.getTime() + 14 * 864e5)));
  const upcomingMatches = filterAndSort(upcoming.events);
  if (upcomingMatches.length > 0) return upcomingMatches;

  // Fallback Flashscore4 quando o primário falhou por QUALQUER motivo (429,
  // timeout, 5xx) — carga completa e vazia é resultado legítimo, não falha,
  // e não gasta a cota de 500/mês da fonte secundária.
  if ((!recent.complete || !upcoming.complete) && allowFlashscore) {
    return searchTennisFlashscore(query);
  }
  return [];
}
