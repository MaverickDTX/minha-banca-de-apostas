-- Duplas no cache de tênis (decisão do usuário, 2026-07-19).
-- O board já traz os doubles nas mesmas chamadas do ciclo — antes eram
-- descartados no toRow; agora entram com is_doubles=true (custo de cota zero).
-- Idempotente.
alter table public.tennis_matches_cache
  add column if not exists is_doubles boolean not null default false;
