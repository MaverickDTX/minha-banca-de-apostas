-- =========================
-- TELEGRAM LINKS
-- =========================
CREATE TABLE IF NOT EXISTS public.telegram_links (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id BIGINT UNIQUE,
  link_code TEXT UNIQUE,
  code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tl_select_own' AND tablename = 'telegram_links') THEN
    CREATE POLICY "tl_select_own" ON public.telegram_links FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tl_insert_own' AND tablename = 'telegram_links') THEN
    CREATE POLICY "tl_insert_own" ON public.telegram_links FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tl_update_own' AND tablename = 'telegram_links') THEN
    CREATE POLICY "tl_update_own" ON public.telegram_links FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- =========================
-- TELEGRAM PENDING BETS
-- =========================
CREATE TABLE IF NOT EXISTS public.telegram_pending_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour',
  awaiting_correction BOOLEAN NOT NULL DEFAULT false
);

GRANT ALL ON public.telegram_pending_bets TO service_role;

ALTER TABLE public.telegram_pending_bets ENABLE ROW LEVEL SECURITY;
-- Sem policies para anon/authenticated: só service_role acessa (bypass RLS)

-- =========================
-- RPC: link_telegram_chat
-- =========================
CREATE OR REPLACE FUNCTION public.link_telegram_chat(p_code TEXT, p_chat_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.telegram_links
  SET chat_id = p_chat_id,
      link_code = NULL,
      code_expires_at = NULL
  WHERE link_code = p_code
    AND code_expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_telegram_chat FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_telegram_chat TO service_role;

-- =========================
-- RPC: create_bet_from_telegram
-- =========================
CREATE OR REPLACE FUNCTION public.create_bet_from_telegram(p_chat_id BIGINT, p_bet JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_id UUID;
  v_cleaned JSONB;
BEGIN
  -- Resolve user_id pelo chat_id vinculado
  SELECT user_id INTO v_user_id
  FROM public.telegram_links
  WHERE chat_id = p_chat_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat não vinculado';
  END IF;

  -- Remove chaves gerenciadas pelo banco
  v_cleaned := p_bet - 'id' - 'user_id' - 'created_at' - 'updated_at' - 'legs';

  INSERT INTO public.bets
    (user_id, bet_date, event_date, sport, league, event_name, market, selection,
     bookmaker, bet_type, timing, odds, closing_odds, stake_amount, stake_units,
     unit_value_at_bet, status, gross_return, net_profit, estimated_probability,
     implied_probability, edge, ev, kelly_fraction, recommended_stake, clv,
     tags, tipster, notes, external_link, is_free_bet)
  SELECT
    v_user_id,
    COALESCE(r.bet_date, now()), r.event_date, r.sport, r.league, r.event_name,
    r.market, r.selection, r.bookmaker,
    COALESCE(r.bet_type, 'simples'), COALESCE(r.timing, 'pre-live'),
    r.odds, r.closing_odds, r.stake_amount, r.stake_units, r.unit_value_at_bet,
    COALESCE(r.status, 'pendente'),
    0::NUMERIC,  -- gross_return (status pendente)
    0::NUMERIC,  -- net_profit (status pendente)
    r.estimated_probability, r.implied_probability, r.edge, r.ev,
    r.kelly_fraction, r.recommended_stake, r.clv,
    COALESCE(r.tags, '{}'::TEXT[]), r.tipster, r.notes, r.external_link,
    COALESCE(r.is_free_bet, false)
  FROM jsonb_populate_record(NULL::public.bets, v_cleaned) r
  RETURNING id INTO v_id;

  -- Insere legs se presentes
  IF p_bet ? 'legs' AND jsonb_typeof(p_bet->'legs') = 'array'
     AND jsonb_array_length(p_bet->'legs') > 0 THEN
    INSERT INTO public.bet_legs
      (bet_id, order_index, sport, league, event_name, home_team, away_team,
       event_date, market, selection, odds, status, tipster)
    SELECT
      v_id,
      COALESCE((l->>'order_index')::INT, t.ord::INT - 1),
      l->>'sport', l->>'league', l->>'event_name', l->>'home_team', l->>'away_team',
      (l->>'event_date')::TIMESTAMPTZ, l->>'market', l->>'selection',
      (l->>'odds')::NUMERIC, COALESCE(l->>'status', 'pendente'), l->>'tipster'
    FROM jsonb_array_elements(p_bet->'legs') WITH ORDINALITY AS t(l, ord);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_bet_from_telegram FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_bet_from_telegram TO service_role;