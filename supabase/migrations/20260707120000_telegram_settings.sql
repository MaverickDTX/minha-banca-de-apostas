-- =========================
-- TELEGRAM SETTINGS (kill-switch e flags operacionais do bot)
-- =========================
CREATE TABLE IF NOT EXISTS public.telegram_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_settings TO service_role;

ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;
-- Sem policies para anon/authenticated: só service_role acessa (bypass RLS)

-- Defense-in-depth: revoga grants herdados dos default privileges do schema
REVOKE ALL ON public.telegram_settings FROM anon, authenticated;
