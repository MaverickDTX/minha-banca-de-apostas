#!/usr/bin/env node
// probe-tennis-api.mjs — testes empíricos do Tennis API (RapidAPI) para embasar
// a migração do autocomplete de tênis (ver docs/PLANO-autocomplete-tenis.md).
//
// NÃO precisa de dependências (usa fetch nativo do Node 18+).
// A chave NÃO fica no repo: passe por variável de ambiente.
//
//   PowerShell:  $env:TENNIS_RAPIDAPI_KEY="sua_chave"; node probe-tennis-api.mjs
//   bash:        TENNIS_RAPIDAPI_KEY=sua_chave node probe-tennis-api.mjs
//
// A chave está no Supabase Vault (secret TENNIS_RAPIDAPI_KEY). Para lê-la sem
// digitá-la à mão, no projeto Bankroll Pro:
//   npx supabase secrets list           (mostra os nomes, não os valores)
// ou pegue o valor no painel do RapidAPI (a mesma X-RapidAPI-Key da conta).

const KEY = process.env.TENNIS_RAPIDAPI_KEY;
const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;

if (!KEY) {
  console.error("✗ Defina TENNIS_RAPIDAPI_KEY no ambiente antes de rodar.");
  process.exit(1);
}

const headers = { "X-RapidAPI-Key": KEY, "X-RapidAPI-Host": HOST };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry com backoff exponencial só para 429. Teto: 3 tentativas (vs 4) e
// dwell máximo por chamada ~6s. Se 429 persistir, aborta cedo e marca
// rateLimited=true para o caller não arriscar veredito sobre o feed.
async function call(path, opts = {}) {
  const url = `${BASE}${path}`;
  const maxTries = opts.maxTries ?? 3;
  const label = opts.label ?? path.slice(0, 60);
  let last;
  for (let t = 1; t <= maxTries; t++) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      last = { status: res.status, ms: Date.now() - t0, body, tries: t };
      if (res.status !== 429) return last;
      if (t < maxTries) {
        const wait = Math.min(2000 * t, 6000);
        process.stdout.write(`    (429, retry ${t}/${maxTries - 1} em ${wait}ms)…\r`);
        await sleep(wait);
      }
    } catch (e) {
      last = { status: 0, ms: Date.now() - t0, body: String(e), tries: t };
      if (t < maxTries) await sleep(2000);
    }
  }
  return { ...last, rateLimited: last?.status === 429 };
}

// Conta itens de uma resposta que pode vir como {matches:[]}, {data:[]} ou [].
function countItems(body) {
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body?.matches)) return body.matches.length;
  if (Array.isArray(body?.data)) return body.data.length;
  if (Array.isArray(body?.data?.data)) return body.data.data.length;
  return null;
}

const line = (s = "") => console.log(s);
const hr = () => line("─".repeat(64));

async function main() {
  line(`\nProbe Tennis API — ${new Date().toISOString()}`);
  hr();

  // ── Teste 0: confirmar o bug do ITF (controle: atp deve dar 200) ────────────
  line("\n[0] tourType 'itf' é inválido? (esperado: itf=400, atp=200)");
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const itf = await call(`/tennis/v2/itf/fixtures/${today}/${in7}?pageSize=10&pageNo=1`);
  const atp = await call(`/tennis/v2/atp/fixtures/${today}/${in7}?pageSize=10&pageNo=1`);
  line(`    itf → HTTP ${itf.status}   atp → HTTP ${atp.status}`);
  const any429 = [itf.status, atp.status].includes(429);
  line(`    veredito: ${any429
    ? `⚠ INCONCLUSIVO — rate limit (429) mascarou o teste. Re-probe após reset.`
    : itf.status === 400 && atp.status === 200
    ? "✓ CONFIRMADO — itf retorna 400, atp funciona"
    : `⚠ inesperado (itf=${itf.status}, atp=${atp.status}) — revisar`}`);

  // ── Teste 1: comportamento de limit e tamanho do board atual ────────────────
  line("\n[1] 'limit' em /ms-api/upcoming/matches");
  for (const limit of [10, 100, 500, 1000]) {
    const r = await call(`/tennis/v2/ms-api/upcoming/matches?limit=${limit}&page=1`);
    const n = countItems(r.body);
    const total = r.body?.total ?? "?";
    line(`    limit=${String(limit).padEnd(4)} → HTTP ${r.status}  itens=${n}  total(campo)=${total}  ${r.ms}ms`);
    await sleep(400); // respeita o throttle de 100 req/min
  }
  line("    (saturação pode ser o tamanho atual do board, não o teto do endpoint)");

  // ── Teste 2: board completo na maior amostra testada ─────────────────────────
  line("\n[2] Tamanho do board (UMA chamada a limit=500, sem paginar)");
  const r2 = await call(`/tennis/v2/ms-api/upcoming/matches?limit=500&page=1`);
  const n2 = countItems(r2.body) ?? 0;
  const total2 = r2.body?.total ?? null;
  line(`    HTTP ${r2.status}  itens=${n2}  total(campo)=${total2}  ${r2.ms}ms`);
  line(`    → custo do "load único" = 1 chamada a limit=500 para esta amostra`);
  if (n2 === 0) {
    if (r2.rateLimited || r2.status === 429) {
      line(`    ⚠ INCONCLUSIVO: chamada recusada por rate limit (HTTP 429).`);
      line(`      Não dá para afirmar se o feed serve ou não — re-probe após reset.`);
    } else {
      line(`    ⚠ FALHA: limit=500 retornou 0 itens — feed provavelmente não serve`);
      line(`      para esta conta (restrição de plano ou janela sem torneios).`);
      line(`      Re-probe em outro horário; se persistir, o desenho ms-api/upcoming cai.`);
    }
  }
  const matches = Array.isArray(r2.body?.matches) ? r2.body.matches : [];

  // ── Teste 3: o plano libera odds? ──────────────────────────────────────────
  line("\n[3] Odds presentes no feed? (odds/predições exigem plano ULTRA/MEGA)");
  const withOdds = matches.filter((m) => {
    const o = m?.odds ?? {};
    const anyK = [o.k1, o.k2, o.ktb, o.ktm].some((v) => v != null);
    const p1o = m?.player1?.odd != null, p2o = m?.player2?.odd != null;
    return anyK || p1o || p2o;
  }).length;
  line(`    amostra=${matches.length} jogos, com odds=${withOdds}`);
  line(`    veredito: ${r2.rateLimited || r2.status === 429
    ? "⚠ INCONCLUSIVO — chamada anterior foi 429, amostra indisponível"
    : matches.length === 0 ? "⚠ feed vazio (200) — checar plano/cobertura"
    : withOdds > 0 ? "✓ odds disponíveis no plano atual"
    : "○ sem odds (plano provavelmente < ULTRA) — nome/data/torneio ainda vêm"}`);

  // ── Teste 4: cobertura ITF/Challenger no feed (via rankId) ──────────────────
  line("\n[4] Cobertura ITF/Challenger no feed (rankId 0=ITF$10K, 1=Challenger/ITF>$10K)");
  const ranks = {};
  for (const m of matches) {
    const rid = m?.tournament?.rankId ?? m?.rank ?? "?";
    ranks[rid] = (ranks[rid] ?? 0) + 1;
  }
  line(`    distribuição de rankId na amostra: ${JSON.stringify(ranks)}`);
  const hasItf = matches.some((m) => [0, 1].includes(m?.tournament?.rankId ?? m?.rank));
  line(`    veredito: ${hasItf
    ? "✓ há jogos ITF/Challenger no feed"
    : "○ amostra sem ITF/Challenger — ampliar amostra (limit maior) antes de concluir"}`);

  hr();
  line("Fim. Cole a saída de volta na conversa para eu fechar o desenho.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
