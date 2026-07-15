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
const fixturesCache = new Map<string, IndexedEvent[]>();
// Dedup de carga em voo: buscas concorrentes (keystrokes) compartilham a mesma
// paginação em vez de cada uma disparar 12 requests e estourar o rate limit.
const inflight = new Map<string, Promise<IndexedEvent[]>>();

// Teto de páginas por tour e janela (proteção contra loop). pageSize=100 → até
// 300 fixtures/tour/janela; mantém o autocomplete responsivo mesmo incluindo ITF.
const MAX_PAGES = 3;
const TOURS = ["atp", "wta", "itf"] as const;
type Tour = typeof TOURS[number];
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Circuit breaker: quando o Matchstat devolve 429 (cota DIÁRIA), ele seguirá
// devolvendo 429 por horas. Sem isto, CADA busca — inclusive futebol/MMA, que
// chamam o tênis como fonte secundária — gastaria ~9s nos 6 tours × 3 retries
// antes de desistir. Após um 429, pulamos o Matchstat por COOLDOWN_MS e vamos
// direto ao fallback, mantendo a busca responsiva. Passado o cooldown, tenta de
// novo (a cota pode ter resetado).
const COOLDOWN_MS = 10 * 60 * 1000; // 10 min
let matchstatBlockedUntil = 0;
const matchstatBlocked = () => Date.now() < matchstatBlockedUntil;
const tripMatchstatBreaker = () => { matchstatBlockedUntil = Date.now() + COOLDOWN_MS; };
// Reset do breaker — usado só em testes (estado de módulo persiste entre casos).
export const __resetMatchstatBreaker = () => { matchstatBlockedUntil = 0; };

// complete=false apenas quando a paginação foi interrompida por erro (ex.: 429).
// Atingir o teto MAX_PAGES com hasNextPage ainda true conta como completo (corte intencional).
// quotaLimited=true se a interrupção foi por 429 (cota diária esgotada) — sinaliza
// para a UI cair no fallback e, se este também falhar, mostrar aviso de fonte limitada.
async function loadTour(type: Tour, start: string, end: string): Promise<{ items: TennisFixture[]; complete: boolean; quotaLimited: boolean }> {
  const all: TennisFixture[] = [];
  let quotaLimited = false;
  // A API pagina via pageNo (1-indexed) + hasNextPage. Sem isto pegávamos só os
  // 100 primeiros fixtures da janela (rodadas iniciais), perdendo jogos posteriores.
  // Sem AbortSignal aqui de propósito: a janela é carga compartilhada (ver loadWindow),
  // não pode ser cancelada pelo keystroke que a disparou.
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    // Proxy: a edge function injeta a chave (Vault) e devolve { ok, status, body }.
    // O plano da RapidAPI limita rajadas; 429 recebe duas novas tentativas curtas.
    let data: { ok?: boolean; status?: number; body?: unknown } | null = null;
    let error: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await supabase.functions.invoke("tennis-fixtures", {
        body: { type, start, end, pageNo },
      });
      data = response.data;
      error = response.error;
      if (error || data?.ok || data?.status !== 429 || attempt === 2) break;
      quotaLimited = true;
      tripMatchstatBreaker(); // cota diária: bloqueia o Matchstat por COOLDOWN_MS
      await wait(500 * (attempt + 1));
    }
    // error = falha da função; ok:false = erro upstream (ex.: 429). Ambos = carga incompleta.
    if (error || !data?.ok) return { items: all, complete: false, quotaLimited };
    const json = data.body;
    // Envelope pode vir como { data:[...], hasNextPage } ou { data:{ data:[...], hasNextPage } }.
    const page: TennisFixture[] = json?.data?.data ?? json?.data ?? [];
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    const hasNext = json?.data?.hasNextPage ?? json?.hasNextPage ?? false;
    if (!hasNext) break;
  }
  return { items: all, complete: true, quotaLimited };
}

async function loadWindow(start: string, end: string): Promise<{ events: IndexedEvent[]; quotaLimited: boolean }> {
  const key = `${start}|${end}`;

  const cached = fixturesCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    // Consultar ATP, WTA e ITF em sequência evita que a primeira digitação
    // consuma todo o limite de taxa do provedor.
    const tours: Array<{ items: TennisFixture[]; complete: boolean; quotaLimited: boolean }> = [];
    for (const tour of TOURS) tours.push(await loadTour(tour, start, end));

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

    // Só cacheia carga completa: evita fixar resultado parcial (ex.: página 1 após 429),
    // que deixaria jogadores de páginas seguintes sumidos pelo resto da sessão.
    if (events.length > 0 && tours.every((tour) => tour.complete)) fixturesCache.set(key, events);
    const quotaLimited = tours.some((tour) => tour.quotaLimited && !tour.complete);
    return { events, quotaLimited };
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

// Sinaliza que o Matchstat (primário) falhou por cota (429) durante a última
// janela. Usado pela UI para distinguir "nenhum evento" de "fonte limitada".
export const tennisQuotaLimited = { value: false };

// ---- Fallback Flashscore4 --------------------------------------------------
// Cadeia search → results/fixtures via proxy (modo provider:"flashscore").
// Usado só quando o Matchstat falha por cota (429). Cada busca = ~2 req (search +
// results) ou ~3 com fixtures; cota Flashscore é 500/mês, então usar só como
// fallback pontual. Função PURA de I/O não é — depende do supabase.functions.

async function fsFetch(path: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await supabase.functions.invoke("tennis-fixtures", {
    body: { provider: "flashscore", path },
  });
  if (response.error) return { ok: false, status: 502, body: null };
  return (response.data as { ok?: boolean; status?: number; body?: unknown }) ?? { ok: false, status: 502, body: null };
}

async function searchTennisFlashscore(query: string): Promise<SportEvent[]> {
  const q = normText(query);
  const search = await fsFetch(`/api/flashscore/v2/general/search?q=${encodeURIComponent(query)}`);
  if (!search.ok) return [];
  const ids = tennisPlayerIdsFromSearch(search.body).slice(0, 5);
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
  // NÃO refaz os 6 tours × 3 retries (~9s) — vai direto ao fallback. Isso mantém
  // responsivas TODAS as buscas, inclusive futebol/MMA que chamam o tênis como
  // fonte secundária. Passado o cooldown, o fluxo normal volta a tentar o primário.
  if (matchstatBlocked()) {
    if (!allowFlashscore) return []; // fonte secundária: não gasta cota do Flashscore
    const fs = await searchTennisFlashscore(query);
    tennisQuotaLimited.value = fs.length === 0;
    return fs;
  }

  // Consulta os jogos passados primeiro e só chama a agenda futura quando não
  // houver resultado. Assim cobre histórico sem disparar as seis consultas de
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

  // Fallback Flashscore4 só quando o primário falhou por cota (429) — preserva a
  // cota de 500/mês da fonte secundária. Se também falhar, marca quota limitada
  // para a UI diferenciar "nenhum evento" de "fonte temporariamente limitada".
  const primaryQuotaLimited = recent.quotaLimited || upcoming.quotaLimited;
  if (primaryQuotaLimited && allowFlashscore) {
    const fs = await searchTennisFlashscore(query);
    if (fs.length > 0) return fs;
  }
  tennisQuotaLimited.value = primaryQuotaLimited;
  return [];
}
