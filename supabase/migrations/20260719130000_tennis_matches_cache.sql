-- Fase 2 do autocomplete de tênis (docs/PLANO-autocomplete-tenis.md §9).
-- Board de próximos jogos espelhado no Postgres: um cron único gasta a cota da
-- RapidAPI (3 chamadas/ciclo); o cliente busca por nome no NOSSO banco (ilike
-- com índice trigram), com custo de cota externa ZERO por keystroke.
-- Decisões (2026-07-19, usuário): pg_cron+pg_net → edge function; leitura por
-- SELECT direto com RLS; poda por cutoff -8d + stale de upcoming (2×TTL).
-- Idempotente: seguro de re-rodar.

-- ── 1. Extensões ─────────────────────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ── 2. Tabela ────────────────────────────────────────────────────────────────
create table if not exists public.tennis_matches_cache (
  match_id     bigint primary key,          -- id do confronto no feed Matchstat
  tour         text not null check (tour in ('atp','wta')),
  rank_id      int,                          -- cobertura ITF/Challenger (0,1,2…)
  starts_at    timestamptz,                  -- match.date (pode vir nulo do feed)
  tournament   text,
  player1_id   bigint,
  player1_name text not null,
  player2_id   bigint,
  player2_name text not null,
  -- hay: nomes normalizados (minúsculas, sem acento) na ESCRITA, para o ilike
  -- não depender de unaccent() por consulta. Mesma normalização do cliente.
  hay          text not null,
  is_past      boolean not null default false, -- histórico curto vs. upcoming
  refreshed_at timestamptz not null default now()
);

-- ilike '%termo%' barato — mesmo mecanismo do /search da Matchstat, no nosso banco.
create index if not exists tennis_cache_hay_trgm
  on public.tennis_matches_cache using gin (hay extensions.gin_trgm_ops);
create index if not exists tennis_cache_starts_at
  on public.tennis_matches_cache (starts_at);

-- ── 3. RLS: leitura para authenticated; escrita só service_role (bypass) ─────
alter table public.tennis_matches_cache enable row level security;
revoke all on public.tennis_matches_cache from anon, authenticated;
grant select on public.tennis_matches_cache to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='tennis_matches_cache'
      and policyname='tmc_read_authenticated'
  ) then
    -- Dado compartilhado e não sensível (jogos públicos): leitura irrestrita
    -- para usuários logados; sem policy de escrita — só o cron (service_role).
    create policy tmc_read_authenticated on public.tennis_matches_cache
      for select to authenticated using (true);
  end if;
end $$;

-- ── 4. Cron: refresh a cada 6h (§9.3 — 4 ciclos × 3 chamadas = 12 req/dia) ───
-- Chama a edge function tennis-refresh via pg_net. A autenticação é por shared
-- secret do Vault (TENNIS_REFRESH_SECRET), lido aqui via public.get_secret —
-- a função valida o header x-refresh-secret contra o mesmo Vault.
-- PRÉ-REQUISITO (manual, uma vez): criar o secret no Vault:
--   select vault.create_secret('<valor-aleatório-forte>', 'TENNIS_REFRESH_SECRET');
do $$
declare jid int;
begin
  select jobid into jid from cron.job where jobname = 'tennis-refresh';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end $$;

-- Minuto 12 para não coincidir com o reset de hora cheia de outras cotas.
select cron.schedule(
  'tennis-refresh',
  '12 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://cttdibubqgrpkdzhojtn.supabase.co/functions/v1/tennis-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret', public.get_secret('TENNIS_REFRESH_SECRET')
    ),
    body    := '{}'::jsonb
  );
  $$
);
