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
type TennisBoardMatch = TennisFixture & {
  type?: string;
  tournament?: { name?: string; rankId?: number };
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

type IndexedEvent = SportEvent & { _hay: string; _past?: boolean };
type LoadResult = { events: IndexedEvent[]; complete: boolean };
// Só cargas COMPLETAS entram no cache, logo todo hit é { complete: true }.
let tennisIndexCache: IndexedEvent[] | null = null;
let tennisIndexComplete = false;
// Dedup de carga em voo: buscas concorrentes (keystrokes) compartilham a mesma
// paginação em vez de cada uma disparar a cascata de requests em paralelo.
let indexInflight: Promise<LoadResult> | null = null;

// Teto de páginas por tour e janela (proteção contra loop). pageSize=100 → até
// 300 fixtures/tour/janela; mantém o autocomplete responsivo.
const MAX_PAGES = 3;
const MAX_BOARD_PAGES = 4;
// Apenas atp e wta são tourTypes válidos na API. NÃO existe tour "itf": passar
// `itf` retorna 400 (doc: tennisapidoc.matchstat.com/fixtures). Jogos ITF/Challenger
// já vêm dentro de atp/wta (filtráveis por rankId 0/1). Manter "itf" aqui gerava
// 400 em 1/3 das chamadas e, por marcar a janela como incompleta, disparava o
// fallback do Flashscore sem necessidade — queimando as duas cotas.
const TOURS = ["atp", "wta"] as const;
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

// ---- Cache persistido (fase 2, §9 do plano) --------------------------------
// Hot path: a tabela public.tennis_matches_cache é populada por cron (12 req/dia
// fixas na RapidAPI) e o autocomplete busca por nome no NOSSO Postgres — custo
// de cota externa ZERO por keystroke. O caminho de edge function (fase 1) vira
// fallback para tabela vazia/stale (cron ainda não rodou ou está quebrado).
const DB_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 4× o TTL do cron (6h)
const DB_META_TTL_MS = 5 * 60 * 1000; // memo da checagem de frescor
let dbUsableMemo: boolean | null = null;
let dbUsableAt = 0;
export const __resetTennisDbCache = () => { dbUsableMemo = null; dbUsableAt = 0; };

async function tennisDbUsable(): Promise<boolean> {
  if (dbUsableMemo !== null && Date.now() - dbUsableAt < DB_META_TTL_MS) return dbUsableMemo;
  const { data, error } = await supabase
    .from("tennis_matches_cache")
    .select("refreshed_at")
    .order("refreshed_at", { ascending: false })
    .limit(1);
  const last = !error && data?.[0]?.refreshed_at ? Date.parse(data[0].refreshed_at) : 0;
  dbUsableMemo = Date.now() - last < DB_CACHE_MAX_AGE_MS;
  dbUsableAt = Date.now();
  return dbUsableMemo;
}

// Escapa curingas do ILIKE — a query vem do usuário.
const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// null = falha de leitura (cai no caminho legado); [] = resultado legítimo.
async function searchTennisDb(q: string): Promise<SportEvent[] | null> {
  const players = q.split(/\s+(?:x|vs\.?)\s+/i).filter(Boolean);
  // hay é gravado normalizado (minúsculo, sem acento) pelo cron — mesma normText.
  // Confronto "A x B": dois ilike encadeados (AND); jogador único: um só.
  let query = supabase
    .from("tennis_matches_cache")
    .select("match_id,tour,starts_at,player1_name,player2_name");
  for (const term of players.length === 2 ? players : [q]) {
    query = query.ilike("hay", likePattern(term));
  }
  const { data, error } = await query
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(15);
  if (error || !data) return null;
  return data.map((row) => ({
    id: `tennis-${row.tour}-${row.match_id}`,
    name: `${row.player1_name} x ${row.player2_name}`,
    sport: "Tênis",
    league: row.tour.toUpperCase(),
    date: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    homeTeam: row.player1_name,
    awayTeam: row.player2_name,
  }));
}

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

export function toEvent(
  match: TennisFixture,
  tour?: string,
  options?: { past?: boolean; tournament?: string },
): IndexedEvent | null {
  const p1 = match.player1?.name ?? "";
  const p2 = match.player2?.name ?? "";
  if (!p1 || !p2) return null;
  // Slots-placeholder do feed ("Unknown Player", partidas TBD) — sem valor.
  if (/unknown player/i.test(p1) || /unknown player/i.test(p2)) return null;
  // Duplas ("A/B") entram no índice (decisão 2026-07-19). No _hay o "/" vira
  // espaço para a busca por parceiro individual casar por substring.
  const league = (tour ?? "tennis").toUpperCase();
  return {
    id: `tennis-${league.toLowerCase()}-${match.id}`,
    name: `${p1} x ${p2}`,
    sport: "Tênis",
    league,
    date: match.date ? new Date(match.date).toISOString() : null,
    homeTeam: p1,
    awayTeam: p2,
    _past: options?.past,
    _hay: normText(`${p1.replace(/\//g, " ")} ${p2.replace(/\//g, " ")}`),
  };
}

export async function loadUpcomingBoard(): Promise<LoadResult> {
  const events: IndexedEvent[] = [];
  for (let page = 1; page <= MAX_BOARD_PAGES; page++) {
    if (matchstatBlocked()) return { events, complete: false };
    const response = await supabase.functions.invoke("tennis-fixtures", {
      body: { path: `/tennis/v2/ms-api/upcoming/matches?limit=500&page=${page}` },
    });
    const data = response.data as Envelope;
    if (data?.status === 429) {
      tripMatchstatBreaker();
      return { events, complete: false };
    }
    if (response.error || !data?.ok) return { events, complete: false };
    const body = data.body as { total?: number; matches?: TennisBoardMatch[] } | null;
    const matches = Array.isArray(body?.matches) ? body.matches : [];
    events.push(...matches.map((match) => toEvent(match, match.type, { tournament: match.tournament?.name })).filter(Boolean) as IndexedEvent[]);
    if (matches.length < 500 || (body?.total !== undefined && events.length >= body.total)) break;
  }
  return { events, complete: true };
}

export async function loadRecentFixtures(): Promise<LoadResult> {
  const now = new Date();
  const start = fmt(new Date(now.getTime() - 7 * 864e5));
  const end = fmt(new Date(now.getTime() - 864e5));
  const all: IndexedEvent[] = [];
  let complete = true;
  for (const tour of TOURS) {
    if (matchstatBlocked()) {
      complete = false;
      continue;
    }
    const result = await loadTour(tour, start, end);
    complete &&= result.complete;
    all.push(...result.items.map((fixture) => toEvent(fixture, tour, { past: true })).filter(Boolean) as IndexedEvent[]);
  }
  return { events: all, complete };
}

export async function loadTennisIndex(): Promise<LoadResult> {
  if (tennisIndexCache) return { events: tennisIndexCache, complete: tennisIndexComplete };
  if (indexInflight) return indexInflight;
  indexInflight = (async () => {
    const upcoming = await loadUpcomingBoard();
    const recent = await loadRecentFixtures();
    const byId = new Map<string, IndexedEvent>();
    [...upcoming.events, ...recent.events].forEach((event) => {
      if (!byId.has(event.id)) byId.set(event.id, event);
    });
    const result = { events: [...byId.values()], complete: upcoming.complete && recent.complete };
    if (result.complete) {
      tennisIndexCache = result.events;
      tennisIndexComplete = true;
    }
    return result;
  })();
  try {
    return await indexInflight;
  } finally {
    indexInflight = null;
  }
}

export const __resetTennisIndex = () => {
  tennisIndexCache = null;
  tennisIndexComplete = false;
  indexInflight = null;
};

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

  // Fase 2 (§9): com o cache do Postgres fresco, TODA busca resolve aqui —
  // inclusive vazia (jogo ausente do snapshot é resultado legítimo, não falha).
  // Só desce ao caminho legado (edge → RapidAPI) se a tabela estiver vazia,
  // stale (> 24h) ou a leitura falhar.
  if (await tennisDbUsable()) {
    const fromDb = await searchTennisDb(q);
    if (fromDb !== null) return fromDb;
  }

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

  const index = await loadTennisIndex();
  const matches = filterAndSort(index.events);
  if (matches.length > 0) return matches;

  // Fallback Flashscore4 quando o primário falhou por QUALQUER motivo (429,
  // timeout, 5xx) — carga completa e vazia é resultado legítimo, não falha,
  // e não gasta a cota de 500/mês da fonte secundária.
  if (!index.complete && allowFlashscore) {
    return searchTennisFlashscore(query);
  }
  return [];
}
