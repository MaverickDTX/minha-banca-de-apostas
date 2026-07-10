-- Hardening de grants/RLS — item #9 (ver SECURITY-AUDIT-2026-07-09.md)
--
-- Contexto: as tabelas de negócio (bets, bet_legs, bankroll_transactions,
-- profiles) receberam ALL para anon/authenticated via default privileges do
-- schema. A RLS já nega o acesso efetivo (todas as policies exigem
-- auth.uid() = user_id, sem USING(true)); anon não tem auth.uid(), então
-- nenhuma linha casa. Isto é defense-in-depth: revogar o grant desnecessário.
--
-- Mesma abordagem já aplicada às tabelas telegram em
-- 20260707120100_telegram_tables_tighten_grants.sql.
--
-- Idempotente: REVOKE/GRANT/CREATE POLICY IF NOT EXISTS são seguros de re-rodar.

-- ── 1. Revogar acesso do role anônimo às tabelas de negócio ──────────────
-- anon não é usado pelo app (o cliente autentica e opera como `authenticated`).
REVOKE ALL ON public.bets                  FROM anon;
REVOKE ALL ON public.bet_legs              FROM anon;
REVOKE ALL ON public.bankroll_transactions FROM anon;
REVOKE ALL ON public.profiles              FROM anon;

-- Garante que `authenticated` mantém o CRUD necessário (a RLS filtra por dono).
-- Explícito para não depender de default privileges herdados.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bet_legs              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankroll_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles              TO authenticated;

-- ── 2. Documentar a intenção nas tabelas só-service_role ─────────────────
-- telegram_pending_bets e telegram_settings têm RLS ligado sem policy
-- (advisor rls_enabled_no_policy, INFO). É intencional: só o service_role
-- (que faz bypass de RLS) acessa. Uma policy de negação explícita para
-- anon/authenticated torna o design explícito e silencia o advisor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='telegram_pending_bets'
      AND policyname='tpb_deny_non_service'
  ) THEN
    CREATE POLICY tpb_deny_non_service ON public.telegram_pending_bets
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='telegram_settings'
      AND policyname='ts_deny_non_service'
  ) THEN
    CREATE POLICY ts_deny_non_service ON public.telegram_settings
      FOR ALL TO anon, authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

-- ── 3. (Opcional) Forçar RLS nas tabelas de negócio ──────────────────────
-- Protege contra acesso via role dono da tabela. service_role e authenticated
-- não são donos, então não muda o fluxo atual — é hardening extra.
ALTER TABLE public.bets                  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bet_legs              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bankroll_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              FORCE ROW LEVEL SECURITY;

-- NOTA: a proteção de senha vazada (advisor auth_leaked_password_protection)
-- NÃO é configurável por migration — é toggle de painel:
-- Authentication → Policies → "Leaked password protection".
