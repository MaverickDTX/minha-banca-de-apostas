-- Liga public.canonical_bookmaker() às RPCs de escrita, ao lado do btrim
-- introduzido em 20260819020000. Redefine as duas funções por inteiro porque o
-- Postgres não permite alterar uma coluna isolada de um create or replace.
--
-- Efeito: "bet365", "BET365" e "bet365 " passam a gravar "Bet365". Casa fora da
-- tabela bookmaker_canonical continua entrando como digitada (só com btrim).

create or replace function public.create_bets_with_legs(p_bets jsonb)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bet jsonb;
  v_id uuid;
begin
  for v_bet in select * from jsonb_array_elements(coalesce(p_bets, '[]'::jsonb))
  loop
    insert into public.bets
      (user_id, bet_date, event_date, sport, league, event_name, market, selection,
       bookmaker, bet_type, timing, odds, closing_odds, stake_amount, stake_units,
       unit_value_at_bet, status, gross_return, net_profit, estimated_probability,
       implied_probability, edge, ev, kelly_fraction, recommended_stake, clv,
       tags, tipster, notes, external_link, is_free_bet)
    select
      (select auth.uid()),
      coalesce(r.bet_date, now()), r.event_date,
      nullif(btrim(r.sport), ''), nullif(btrim(r.league), ''), nullif(btrim(r.event_name), ''),
      nullif(btrim(r.market), ''), nullif(btrim(r.selection), ''),
      public.canonical_bookmaker(r.bookmaker),
      coalesce(r.bet_type, 'simples'), coalesce(r.timing, 'pre-live'),
      r.odds, r.closing_odds, r.stake_amount, r.stake_units, r.unit_value_at_bet,
      coalesce(r.status, 'pendente'), r.gross_return, r.net_profit,
      r.estimated_probability, r.implied_probability, r.edge, r.ev,
      r.kelly_fraction, r.recommended_stake, r.clv,
      coalesce(r.tags, '{}'::text[]), nullif(btrim(r.tipster), ''), r.notes, r.external_link,
      coalesce(r.is_free_bet, false)
    from jsonb_populate_record(
           null::public.bets,
           v_bet - 'legs' - 'id' - 'user_id' - 'created_at' - 'updated_at'
         ) r
    returning id into v_id;

    if v_bet ? 'legs' and jsonb_typeof(v_bet->'legs') = 'array'
       and jsonb_array_length(v_bet->'legs') > 0 then
      perform public.replace_bet_legs(v_id, v_bet->'legs');
    end if;

    return next v_id;
  end loop;
end;
$$;

create or replace function public.update_bet_with_legs(
  p_bet_id uuid,
  p_fields jsonb default '{}'::jsonb,
  p_legs jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb) - 'id' - 'user_id' - 'created_at' - 'updated_at' - 'legs';
begin
  update public.bets tgt
  set (bet_date, event_date, sport, league, event_name, market, selection, bookmaker,
       bet_type, timing, odds, closing_odds, stake_amount, stake_units, unit_value_at_bet,
       status, gross_return, net_profit, estimated_probability, implied_probability,
       edge, ev, kelly_fraction, recommended_stake, clv, tags, tipster, notes,
       external_link, is_free_bet, updated_at)
    = (select r.bet_date, r.event_date,
       nullif(btrim(r.sport), ''), nullif(btrim(r.league), ''), nullif(btrim(r.event_name), ''),
       nullif(btrim(r.market), ''), nullif(btrim(r.selection), ''),
       public.canonical_bookmaker(r.bookmaker),
       r.bet_type, r.timing, r.odds, r.closing_odds, r.stake_amount, r.stake_units, r.unit_value_at_bet,
       r.status, r.gross_return, r.net_profit, r.estimated_probability, r.implied_probability,
       r.edge, r.ev, r.kelly_fraction, r.recommended_stake, r.clv, r.tags,
       nullif(btrim(r.tipster), ''), r.notes,
       r.external_link, r.is_free_bet, now()
       from jsonb_populate_record(null::public.bets, to_jsonb(tgt) || v_fields) r)
  where tgt.id = p_bet_id and tgt.user_id = (select auth.uid());

  if not found then
    raise exception 'bet % not found or not owned by caller', p_bet_id;
  end if;

  if p_legs is not null then
    perform public.replace_bet_legs(p_bet_id, p_legs);
  end if;
end;
$$;
