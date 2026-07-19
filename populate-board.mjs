#!/usr/bin/env node
// populate-board.mjs — popula board de upcoming no tennis_matches_cache.
//
// DOIS MODOS, para não desperdiçar cota (50/dia na RapidAPI):
//   node populate-board.mjs fetch     → 1 chamada; salva o JSON BRUTO em board.json
//   node populate-board.mjs upsert    → 0 chamadas; transforma board.json e upserta
// O transform pode ser corrigido e re-rodado à vontade sobre o arquivo salvo.
// Lição 2026-07-19: nunca filtrar e descartar a resposta sem persistir o bruto.
//
// Requer: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (upsert)
//         TENNIS_RAPIDAPI_KEY (fetch)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

const MODE = process.argv[2] ?? 'upsert';
const FILE = 'board.json';
const HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';

const normText = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

async function fetchBoard() {
  const key = process.env.TENNIS_RAPIDAPI_KEY;
  if (!key) { console.error('Defina TENNIS_RAPIDAPI_KEY'); process.exit(1); }
  console.log('Buscando board ms-api/upcoming (1 chamada)...');
  const res = await fetch(`https://${HOST}/tennis/v2/ms-api/upcoming/matches?limit=500&page=1`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
  });
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status}: ${text.slice(0, 300)}`); process.exit(1); }
  writeFileSync(FILE, text);
  const data = JSON.parse(text);
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  console.log(`Salvo em ${FILE}: ${matches.length} itens (total=${data?.total})`);
  if (matches[0]) {
    console.log('--- Item [0] BRUTO (para conferir o shape antes do upsert):');
    console.log(JSON.stringify(matches[0], null, 2));
  }
}

// Coerções defensivas: id pode vir string; type pode vir "ATP"/"WTA" ou faltar
// (inferimos por tournament.type se existir). Cada rejeição é CONTADA por motivo
// — nunca mais descarte silencioso.
function toRow(m, nowIso, reasons) {
  const rawTour = m.type ?? m.tour ?? m.tournament?.type ?? '';
  const tour = normText(rawTour);
  if (tour !== 'atp' && tour !== 'wta') { reasons.tour = (reasons.tour ?? 0) + 1; return null; }
  // O board ms-api NÃO traz id de partida (confirmado no board.json de
  // 2026-07-19): o confronto é identificado pelo par de jogadores. Sintetiza um
  // match_id NEGATIVO e estável a partir dos ids dos jogadores — negativo para
  // nunca colidir com os ids reais (positivos) do histórico de fixtures.
  const pid1 = Number(m.player1?.id);
  const pid2 = Number(m.player2?.id);
  const realId = Number(m.id);
  const id = Number.isFinite(realId)
    ? realId
    : Number.isFinite(pid1) && Number.isFinite(pid2)
    ? -(pid1 * 10_000_000 + pid2)
    : NaN;
  if (!Number.isFinite(id)) { reasons.id = (reasons.id ?? 0) + 1; return null; }
  const p1 = m.player1?.name ?? '';
  const p2 = m.player2?.name ?? '';
  if (!p1 || !p2) { reasons.players = (reasons.players ?? 0) + 1; return null; }
  if (p1.includes('/') || p2.includes('/')) { reasons.doubles = (reasons.doubles ?? 0) + 1; return null; }
  return {
    match_id: id,
    tour,
    rank_id: m.tournament?.rankId ?? null,
    starts_at: m.date ? new Date(m.date).toISOString() : null,
    tournament: m.tournament?.name ?? null,
    player1_id: Number(m.player1?.id) || null,
    player1_name: p1,
    player2_id: Number(m.player2?.id) || null,
    player2_name: p2,
    hay: normText(`${p1} ${p2}`),
    is_past: false,
    refreshed_at: nowIso,
  };
}

async function upsertFromFile() {
  const url = process.env.SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srk) { console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const matches = Array.isArray(data?.matches) ? data.matches : [];
  console.log(`${FILE}: ${matches.length} itens`);
  const nowIso = new Date().toISOString();
  const reasons = {};
  const rows = matches.map((m) => toRow(m, nowIso, reasons)).filter(Boolean);
  console.log(`Válidos: ${rows.length} | Rejeitados por motivo:`, reasons);
  if (rows.length === 0) {
    console.log('Nada a inserir. Confira o item [0] bruto:');
    console.log(JSON.stringify(matches[0], null, 2));
    process.exit(1);
  }
  const supabase = createClient(url, srk);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('tennis_matches_cache').upsert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  console.log(`✓ Board populado: ${rows.length} linhas is_past=false`);
}

(MODE === 'fetch' ? fetchBoard() : upsertFromFile()).catch((e) => { console.error(e); process.exit(1); });
