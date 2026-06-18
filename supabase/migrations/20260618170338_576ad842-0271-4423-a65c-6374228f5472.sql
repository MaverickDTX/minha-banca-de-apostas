
-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  initial_bankroll NUMERIC(14,2) NOT NULL DEFAULT 1000,
  unit_value NUMERIC(14,2) NOT NULL DEFAULT 10,
  unit_mode TEXT NOT NULL DEFAULT 'fixed', -- fixed | percent
  unit_percent NUMERIC(6,3) NOT NULL DEFAULT 1.0,
  kelly_fraction NUMERIC(6,3) NOT NULL DEFAULT 0.25,
  stake_warning_percent NUMERIC(6,3) NOT NULL DEFAULT 5.0,
  theme TEXT NOT NULL DEFAULT 'dark',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- =========================
-- BETS
-- =========================
CREATE TABLE public.bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bet_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_date TIMESTAMPTZ,
  sport TEXT,
  league TEXT,
  event_name TEXT,
  market TEXT,
  selection TEXT,
  bookmaker TEXT,
  bet_type TEXT NOT NULL DEFAULT 'simples', -- simples | multipla | sistema
  timing TEXT NOT NULL DEFAULT 'pre-live',  -- pre-live | live
  odds NUMERIC(10,3) NOT NULL,
  closing_odds NUMERIC(10,3),
  stake_amount NUMERIC(14,2) NOT NULL,
  stake_units NUMERIC(10,3),
  unit_value_at_bet NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | green | red | void | half_green | half_red | cashout
  gross_return NUMERIC(14,2),
  net_profit NUMERIC(14,2),
  estimated_probability NUMERIC(6,3), -- 0..100
  implied_probability NUMERIC(6,3),
  edge NUMERIC(8,3),
  ev NUMERIC(14,2),
  kelly_fraction NUMERIC(8,4),
  recommended_stake NUMERIC(14,2),
  clv NUMERIC(8,3),
  tags TEXT[] DEFAULT '{}',
  tipster TEXT,
  notes TEXT,
  external_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bets_user_id_idx ON public.bets(user_id);
CREATE INDEX bets_bet_date_idx ON public.bets(user_id, bet_date DESC);
CREATE INDEX bets_status_idx ON public.bets(user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets TO authenticated;
GRANT ALL ON public.bets TO service_role;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bets_select_own" ON public.bets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bets_insert_own" ON public.bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bets_update_own" ON public.bets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bets_delete_own" ON public.bets FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- BANKROLL TRANSACTIONS
-- =========================
CREATE TABLE public.bankroll_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  tx_type TEXT NOT NULL, -- deposit | withdrawal | adjustment | bonus | transfer | unit_change
  amount NUMERIC(14,2) NOT NULL,
  bookmaker TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bankroll_tx_user_idx ON public.bankroll_transactions(user_id, tx_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankroll_transactions TO authenticated;
GRANT ALL ON public.bankroll_transactions TO service_role;
ALTER TABLE public.bankroll_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bk_select_own" ON public.bankroll_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bk_insert_own" ON public.bankroll_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bk_update_own" ON public.bankroll_transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bk_delete_own" ON public.bankroll_transactions FOR DELETE USING (auth.uid() = user_id);

-- =========================
-- updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bets_set_updated_at BEFORE UPDATE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Auto-create profile on signup
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
