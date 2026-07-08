-- Alinha grants à intenção declarada na migration 20260706120000_telegram_bot.sql
-- (default privileges do schema haviam concedido ALL a anon/authenticated;
-- RLS já negava o acesso efetivo — isto é defense-in-depth)
REVOKE ALL ON public.telegram_pending_bets FROM anon, authenticated;
REVOKE ALL ON public.telegram_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.telegram_links TO authenticated;
