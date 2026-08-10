// Cron de refresh do cache de tênis (docs/PLANO-autocomplete-tenis.md §9).
// Ciclo de ~5-7 chamadas à RapidAPI por rodada: board ms-api/upcoming (1-3),
// fixtures -7d..-1d por tour (2) e fixtures hoje..+7d por tour (2). Normaliza e
// faz upsert em public.tennis_matches_cache.
// O cliente NUNCA chama esta função — só o pg_cron (e, manualmente, o dev).
//
// Deploy: supabase functions deploy tennis-refresh --no-verify-jwt
// (sem JWT porque o pg_net não tem sessão; a autenticação é o shared secret
// x-refresh-secret validado contra o Vault, + guarda de frescor como teto.)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
// Guarda de frescor: mesmo que o endpoint seja chamado à toa (spam, retry do
// pg_net, curl de teste), só toca a RapidAPI se o último refresh tiver mais de
// MIN_INTERVAL. É o que dá TETO ABSOLUTO de cota independente do chamador.
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2h (< TTL de 6h do cron)
const BOARD_LIMIT = 500;
const MAX_BOARD_PAGES = 4;
const MAX_FIXTURE_PAGES = 3;
// Janela de jogos futuros lida do endpoint core de fixtures (ver fetchUpcoming).
const UPCOMING_DAYS = 7;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function secret(name: string): Promise<string | null> {
  const { data, error } = await admin.rpc("get_secret", { p_name: name });
  return error ? null : (data as string | null);
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type Player = { id?: number; name?: string };
type BoardMatch = {
  // Board ms-api NÃO traz id de partida; fixtures do histórico trazem.
  id?: number;
  date?: string | null;
  type?: string;
  tournament?: { id?: number; name?: string; rankId?: number };
  player1?: Player;
  player2?: Player;
};
type Fixture = BoardMatch; // fixtures legado: mesmo subconjunto de campos usados

type Row = {
  match_id: number;
  tour: string;
  rank_id: number | null;
  starts_at: string | null;
  tournament: string | null;
  player1_id: number | null;
  player1_name: string;
  player2_id: number | null;
  player2_name: string;
  hay: string;
  is_doubles: boolean;
  is_past: boolean;
  refreshed_at: string;
};

// MESMA normalização do cliente (src/lib/tennis.ts normText): o ilike do
// autocomplete pressupõe hay minúsculo e sem acento.
const normText = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// FNV-1a 32 bits — id estável para itens SEM player.id (comum em duplas do
// board). Entrada: hay + torneio (NÃO a data: remarcação mudaria o id e
// duplicaria a linha no upsert). Mapeado para a faixa -(1e14..~1.000043e14),
// disjunta da faixa dos singles sintéticos -(p1*1e7+p2) (≤ ~1e13).
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function toRow(m: BoardMatch, tour: string, isPast: boolean, now: string): Row | null {
  // O board ms-api NÃO traz id de partida (shape real confirmado em board.json,
  // 2026-07-19 — foi isso que descartava 293/293 itens em silêncio): o confronto
  // é identificado pelo par de jogadores. Quando m.id existe (fixtures do
  // histórico), usa o id real; senão sintetiza um match_id NEGATIVO e estável a
  // partir dos ids dos jogadores — negativo para nunca colidir com os ids reais
  // (positivos) do histórico.
  const p1 = m.player1?.name ?? "";
  const p2 = m.player2?.name ?? "";
  if (!p1 || !p2) return null;
  if (tour !== "atp" && tour !== "wta") return null;
  // Slots-placeholder do feed ("Unknown Player", id-sentinela 3699) são
  // partidas TBD sem valor no autocomplete — e colidem entre si no id.
  if (/unknown player/i.test(p1) || /unknown player/i.test(p2)) return null;
  // Duplas ("A/B" x "C/D") ENTRAM no índice (decisão 2026-07-19); o flag
  // is_doubles permite à UI diferenciar. No hay, "/" vira espaço para que a
  // busca por qualquer parceiro individual case por substring.
  const isDoubles = p1.includes("/") || p2.includes("/");
  const pid1 = Number(m.player1?.id);
  const pid2 = Number(m.player2?.id);
  const realId = Number(m.id);
  const hay = normText(`${p1.replace(/\//g, " ")} ${p2.replace(/\//g, " ")}`);
  const matchId = Number.isFinite(realId)
    ? realId
    : Number.isFinite(pid1) && Number.isFinite(pid2)
    ? -(pid1 * 10_000_000 + pid2)
    : -(100_000_000_000_000 + fnv1a(`${hay}|${m.tournament?.id ?? ""}`));
  return {
    match_id: matchId,
    tour,
    rank_id: m.tournament?.rankId ?? null,
    starts_at: m.date ? new Date(m.date).toISOString() : null,
    tournament: m.tournament?.name ?? null,
    player1_id: Number.isFinite(pid1) ? pid1 : null,
    player1_name: p1,
    player2_id: Number.isFinite(pid2) ? pid2 : null,
    player2_name: p2,
    hay,
    is_doubles: isDoubles,
    is_past: isPast,
    refreshed_at: now,
  };
}

async function rapid(path: string, key: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://${HOST}${path}`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: null };
  }
}

// Board consolidado ATP+WTA. Paginação: para quando a página vem vazia.
// NÃO usar `matches.length < BOARD_LIMIT` nem o `total` do corpo como sinal de
// fim — confirmado em 2026-08-10 que este endpoint devolve páginas de ~200
// itens mesmo com limit=500, e `total` reflete a contagem DAQUELA página, não
// o total geral (sem hasNextPage, ao contrário do endpoint de fixtures). Usar
// esse corte fazia o board parar sempre na página 1, perdendo em silêncio tudo
// da página 2 em diante (medido: 200 de 365 itens capturados) com a carga ainda
// marcada como "completa".
// ATENÇÃO: corrigir esta paginação NÃO basta para cobrir torneios de nível
// principal — o board não lista o WTA Toronto (rankId 3) em página nenhuma.
// Quem cobre esses jogos é fetchUpcoming(), no endpoint core de fixtures.
async function fetchBoard(key: string): Promise<{ matches: BoardMatch[]; ok: boolean; calls: number }> {
  const all: BoardMatch[] = [];
  let calls = 0;
  for (let page = 1; page <= MAX_BOARD_PAGES; page++) {
    const { status, body } = await rapid(
      `/tennis/v2/ms-api/upcoming/matches?limit=${BOARD_LIMIT}&page=${page}`,
      key,
    );
    calls++;
    if (status !== 200) return { matches: all, ok: false, calls };
    const b = body as { total?: number; matches?: BoardMatch[] } | null;
    const matches = Array.isArray(b?.matches) ? b.matches : [];
    if (matches.length === 0) break;
    all.push(...matches);
  }
  return { matches: all, ok: true, calls };
}

const fmtDay = (d: Date) => d.toISOString().slice(0, 10);

// Endpoint CORE de fixtures por intervalo (pageSize/pageNo + hasNextPage REAL).
// É a fonte de verdade documentada — ao contrário do board ms-api/upcoming, que
// não expõe hasNextPage e (confirmado 2026-08-10) simplesmente NÃO lista parte
// dos torneios de nível principal, entre eles o WTA Toronto (rankId 3).
async function fetchFixtures(
  tour: string,
  start: string,
  end: string,
  key: string,
): Promise<{ matches: Fixture[]; ok: boolean; calls: number }> {
  const all: Fixture[] = [];
  let calls = 0;
  for (let pageNo = 1; pageNo <= MAX_FIXTURE_PAGES; pageNo++) {
    const { status, body } = await rapid(
      `/tennis/v2/${tour}/fixtures/${start}/${end}?include=tournament&pageSize=100&pageNo=${pageNo}`,
      key,
    );
    calls++;
    if (status !== 200) return { matches: all, ok: false, calls };
    const b = body as { data?: Fixture[] | { data?: Fixture[]; hasNextPage?: boolean }; hasNextPage?: boolean } | null;
    const inner = b?.data;
    const page = Array.isArray(inner) ? inner : inner?.data ?? [];
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    const hasNext = (Array.isArray(inner) ? b?.hasNextPage : inner?.hasNextPage) ?? false;
    if (!hasNext) break;
  }
  return { matches: all, ok: true, calls };
}

// Histórico curto -7d..-1d por tour.
const fetchRecent = (tour: string, key: string) =>
  fetchFixtures(
    tour,
    fmtDay(new Date(Date.now() - 7 * 864e5)),
    fmtDay(new Date(Date.now() - 864e5)),
    key,
  );

// Janela FUTURA hoje..+UPCOMING_DAYS por tour. Este é o fix da lacuna que fazia
// torneios de nível principal nunca chegarem ao autocomplete: até 2026-08-10 os
// jogos futuros vinham SÓ do board ms-api/upcoming, que não lista o WTA Toronto.
// Medido em 2026-08-10: a semana inteira do WTA cabe em 73 itens / 1 chamada
// (hasNextPage=false), então o custo de cota é ~1 chamada por tour por refresh.
const fetchUpcoming = (tour: string, key: string) =>
  fetchFixtures(
    tour,
    fmtDay(new Date()),
    fmtDay(new Date(Date.now() + UPCOMING_DAYS * 864e5)),
    key,
  );

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  // Auth: shared secret do Vault. Sem ele configurado, a função recusa tudo.
  const expected = await secret("TENNIS_REFRESH_SECRET");
  if (!expected || req.headers.get("x-refresh-secret") !== expected) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch { /* corpo vazio do pg_net é aceitável */ }

  // Guarda de frescor (teto de cota independente do chamador).
  if (!force) {
    const { data } = await admin
      .from("tennis_matches_cache")
      .select("refreshed_at")
      .order("refreshed_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.refreshed_at ? Date.parse(data[0].refreshed_at) : 0;
    if (Date.now() - last < MIN_INTERVAL_MS) {
      return json({ ok: true, skipped: true, reason: "fresh", last_refresh: data?.[0]?.refreshed_at });
    }
  }

  const key = await secret("TENNIS_RAPIDAPI_KEY");
  if (!key) return json({ ok: false, error: "TENNIS_RAPIDAPI_KEY ausente no Vault" }, 500);

  const nowIso = new Date().toISOString();
  const board = await fetchBoard(key);
  const atp = await fetchRecent("atp", key);
  const wta = await fetchRecent("wta", key);
  const atpNext = await fetchUpcoming("atp", key);
  const wtaNext = await fetchUpcoming("wta", key);
  const calls = board.calls + atp.calls + wta.calls + atpNext.calls + wtaNext.calls;

  // Dedup por match_id: o board (upcoming, com rankId/torneio) tem precedência
  // sobre o histórico quando o mesmo id aparecer nos dois.
  const rows = new Map<number, Row>();
  for (const m of atp.matches) {
    const r = toRow(m, "atp", true, nowIso);
    if (r) rows.set(r.match_id, r);
  }
  for (const m of wta.matches) {
    const r = toRow(m, "wta", true, nowIso);
    if (r) rows.set(r.match_id, r);
  }
  for (const m of board.matches) {
    const tour = (m.type ?? "").toLowerCase();
    const r = toRow(m, tour, false, nowIso);
    if (r) rows.set(r.match_id, r);
  }

  // Jogos futuros do endpoint CORE entram POR ÚLTIMO e têm precedência sobre o
  // board, porque trazem (a) o match_id REAL — o board não tem id de partida e
  // obriga a sintetizar um id negativo a partir dos jogadores — e (b) torneios
  // de nível principal que o board pura e simplesmente não lista.
  // A poda por (tour|hay) é obrigatória: sem ela o mesmo confronto entraria
  // DUAS vezes no autocomplete, uma com o id sintético do board e outra com o
  // id real do core (as datas podem divergir em horas entre as duas fontes,
  // então dedupe por data não resolveria).
  const upcomingKey = (r: Row) => `${r.tour}|${r.hay}`;
  const boardUpcoming = new Map<string, number>();
  for (const [id, r] of rows) if (!r.is_past) boardUpcoming.set(upcomingKey(r), id);
  for (const [tour, res] of [["atp", atpNext], ["wta", wtaNext]] as const) {
    for (const m of res.matches) {
      const r = toRow(m, tour, false, nowIso);
      if (!r) continue;
      const dup = boardUpcoming.get(upcomingKey(r));
      if (dup !== undefined && dup !== r.match_id) rows.delete(dup);
      rows.set(r.match_id, r);
    }
  }

  let upserted = 0;
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const { error } = await admin.from("tennis_matches_cache").upsert(chunk);
    if (error) return json({ ok: false, error: `upsert: ${error.message}`, calls }, 500);
    upserted += chunk.length;
  }

  // Poda 1 (sempre segura): fora da janela do histórico (-7d) com 1 dia de folga.
  const cutoff = new Date(Date.now() - 8 * 864e5).toISOString();
  await admin.from("tennis_matches_cache").delete().lt("starts_at", cutoff);

  // Poda 2 (só após board COMPLETO): upcoming que sumiu do feed (cancelado/
  // remarcado) fica com refreshed_at antigo. 2×TTL de folga. Com board
  // incompleto NÃO podar — apagaria jogos válidos que só não foram re-vistos.
  // Só podar com TODAS as fontes de "upcoming" completas (board + core): se uma
  // delas falhou, os jogos que ela cobre ficaram sem refresh nesta rodada e
  // seriam apagados como se tivessem sumido do feed.
  if (board.ok && atpNext.ok && wtaNext.ok) {
    const stale = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    await admin.from("tennis_matches_cache").delete()
      .eq("is_past", false).lt("refreshed_at", stale);
  }

  return json({
    ok: board.ok && atp.ok && wta.ok && atpNext.ok && wtaNext.ok,
    upserted,
    calls,
    board: { ok: board.ok, matches: board.matches.length },
    recent: { atp: { ok: atp.ok, n: atp.matches.length }, wta: { ok: wta.ok, n: wta.matches.length } },
    upcoming: { atp: { ok: atpNext.ok, n: atpNext.matches.length }, wta: { ok: wtaNext.ok, n: wtaNext.matches.length } },
  });
});
