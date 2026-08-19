-- Normaliza espaços nas bordas dos campos textuais na escrita de apostas.
--
-- Motivação: nomes de mercado com espaço no fim ("Primeiro time a marcar no 1º tempo ")
-- criam um bucket separado do canônico no Analytics, que agrupa por `bets.market`.
-- O defeito foi corrigido nos dados em 27/07 e reincidiu — a limpeza pontual não
-- sustenta a invariante porque nada no caminho de escrita a garantia.
--
-- A correção fica na RPC, e não no client, porque a reincidência veio da
-- importação de CSV (ImportExport.tsx), não do formulário. Qualquer caminho novo
-- de escrita passa por aqui e herda a garantia.
--
-- nullif(btrim(x), '') também converte string vazia em NULL: "" e NULL representavam
-- o mesmo estado (campo não preenchido) e geravam buckets distintos.

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
      nullif(btrim(r.market), ''), nullif(btrim(r.selection), ''), nullif(btrim(r.bookmaker), ''),
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
       nullif(btrim(r.market), ''), nullif(btrim(r.selection), ''), nullif(btrim(r.bookmaker), ''),
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

-- As pernas de múltiplas têm market/selection próprios e alimentam o
-- MarketAutocomplete, então herdam a mesma normalização.
create or replace function public.replace_bet_legs(p_bet_id uuid, p_legs jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bets b
    where b.id = p_bet_id and b.user_id = (select auth.uid())
  ) then
    raise exception 'bet % not found or not owned by caller', p_bet_id;
  end if;

  delete from public.bet_legs where bet_id = p_bet_id;

  insert into public.bet_legs
    (bet_id, order_index, sport, league, event_name, home_team, away_team,
     event_date, market, selection, odds, status, tipster)
  select
    p_bet_id,
    coalesce((l->>'order_index')::int, t.ord::int - 1),
    nullif(btrim(l->>'sport'), ''), nullif(btrim(l->>'league'), ''),
    nullif(btrim(l->>'event_name'), ''), nullif(btrim(l->>'home_team'), ''),
    nullif(btrim(l->>'away_team'), ''),
    (l->>'event_date')::timestamptz,
    nullif(btrim(l->>'market'), ''), nullif(btrim(l->>'selection'), ''),
    (l->>'odds')::numeric, coalesce(l->>'status', 'pendente'),
    nullif(btrim(l->>'tipster'), '')
  from jsonb_array_elements(coalesce(p_legs, '[]'::jsonb)) with ordinality as t(l, ord);
end;
$$;
