// Cron de refresh do cache de tênis (docs/PLANO-autocomplete-tenis.md §9).
// Executa o ciclo de 3 chamadas à RapidAPI (board ms-api/upcoming + fixtures
// atp/wta -7d..-1d), normaliza e faz upsert em public.tennis_matches_cache.
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

// Board consolidado ATP+WTA. Paginação por saturação (== BOARD_LIMIT itens).
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
    all.push(...matches);
    if (matches.length < BOARD_LIMIT || (b?.total !== undefined && all.length >= b.total)) break;
  }
  return { matches: all, ok: true, calls };
}

// Histórico curto -7d..-1d por tour (fixtures legado, pageSize/pageNo).
async function fetchRecent(tour: string, key: string): Promise<{ matches: Fixture[]; ok: boolean; calls: number }> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const now = Date.now();
  const start = fmt(new Date(now - 7 * 864e5));
  const end = fmt(new Date(now - 864e5));
  const all: Fixture[] = [];
  let calls = 0;
  for (let pageNo = 1; pageNo <= MAX_FIXTURE_PAGES; pageNo++) {
    const { status, body } = await rapid(
      `/tennis/v2/${tour}/fixtures/${start}/${end}?pageSize=100&pageNo=${pageNo}`,
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
  const calls = board.calls + atp.calls + wta.calls;

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
  if (board.ok) {
    const stale = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    await admin.from("tennis_matches_cache").delete()
      .eq("is_past", false).lt("refreshed_at", stale);
  }

  return json({
    ok: board.ok && atp.ok && wta.ok,
    upserted,
    calls,
    board: { ok: board.ok, matches: board.matches.length },
    recent: { atp: { ok: atp.ok, n: atp.matches.length }, wta: { ok: wta.ok, n: wta.matches.length } },
  });
});
