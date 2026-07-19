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
  id: number;
  date?: string | null;
  type?: string;
  tournament?: { name?: string; rankId?: number };
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
  is_past: boolean;
  refreshed_at: string;
};

// MESMA normalização do cliente (src/lib/tennis.ts normText): o ilike do
// autocomplete pressupõe hay minúsculo e sem acento.
const normText = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

function toRow(m: BoardMatch, tour: string, isPast: boolean, now: string): Row | null {
  // Itens do feed podem vir sem id (slot vazio, ruido). A coluna match_id é
  // primary key not-null, então sem id válido o item não é indexável — descarta.
  if (typeof m.id !== "number" || !Number.isFinite(m.id)) return null;
  const p1 = m.player1?.name ?? "";
  const p2 = m.player2?.name ?? "";
  // Doubles vêm como "A/B" — fora do índice, como no cliente.
  if (!p1 || !p2 || p1.includes("/") || p2.includes("/")) return null;
  if (tour !== "atp" && tour !== "wta") return null;
  return {
    match_id: m.id,
    tour,
    rank_id: m.tournament?.rankId ?? null,
    starts_at: m.date ? new Date(m.date).toISOString() : null,
    tournament: m.tournament?.name ?? null,
    player1_id: m.player1?.id ?? null,
    player1_name: p1,
    player2_id: m.player2?.id ?? null,
    player2_name: p2,
    hay: normText(`${p1} ${p2}`),
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
    const r = toRow(m, m.type ?? "", false, nowIso);
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
