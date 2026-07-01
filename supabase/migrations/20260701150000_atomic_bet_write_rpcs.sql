-- #19: RPCs transacionais para escritas compostas (bets + bet_legs).
-- Todas SECURITY INVOKER: RLS das tabelas continua sendo aplicada ao chamador.
-- Aplicada no projeto remoto em 2026-07-01 via MCP (mesmo conteúdo).

-- 1) Substitui integralmente as pernas de uma aposta (delete + insert atômicos).
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
    l->>'sport', l->>'league', l->>'event_name', l->>'home_team', l->>'away_team',
    (l->>'event_date')::timestamptz, l->>'market', l->>'selection',
    (l->>'odds')::numeric, coalesce(l->>'status', 'pendente'), l->>'tipster'
  from jsonb_array_elements(coalesce(p_legs, '[]'::jsonb)) with ordinality as t(l, ord);
end;
$$;

-- 2) Atualiza campos de uma aposta (patch jsonb: só as chaves presentes mudam,
--    null explícito limpa o campo) e opcionalmente substitui as pernas — tudo numa transação.
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
    = (select r.bet_date, r.event_date, r.sport, r.league, r.event_name, r.market, r.selection, r.bookmaker,
       r.bet_type, r.timing, r.odds, r.closing_odds, r.stake_amount, r.stake_units, r.unit_value_at_bet,
       r.status, r.gross_return, r.net_profit, r.estimated_probability, r.implied_probability,
       r.edge, r.ev, r.kelly_fraction, r.recommended_stake, r.clv, r.tags, r.tipster, r.notes,
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

-- 3) Liquidação em lote: status + net_profit + gross_return, e status das pernas
--    de múltiplas, tudo numa transação (falha em qualquer item reverte tudo).
create or replace function public.bulk_settle_bets(p_updates jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select (u->>'id')::uuid as id,
           u->>'bet_type' as bet_type,
           u->>'status' as status,
           (u->>'net_profit')::numeric as net_profit,
           (u->>'gross_return')::numeric as gross_return
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) u
  loop
    update public.bets
    set status = r.status,
        net_profit = r.net_profit,
        gross_return = r.gross_return,
        updated_at = now()
    where id = r.id and user_id = (select auth.uid());

    if not found then
      raise exception 'bet % not found or not owned by caller', r.id;
    end if;

    if r.bet_type = 'multipla' then
      update public.bet_legs
      set status = case
            when r.status in ('green', 'half_green', 'cashout') then 'green'
            when r.status in ('red', 'half_red') then 'red'
            when r.status = 'void' then 'void'
            else 'pendente'
          end,
          updated_at = now()
      where bet_id = r.id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 4) Criação (single ou bulk) de apostas com pernas numa transação.
--    Cada item pode conter a chave "legs" (array). Retorna os ids criados na ordem.
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
      coalesce(r.bet_date, now()), r.event_date, r.sport, r.league, r.event_name,
      r.market, r.selection, r.bookmaker,
      coalesce(r.bet_type, 'simples'), coalesce(r.timing, 'pre-live'),
      r.odds, r.closing_odds, r.stake_amount, r.stake_units, r.unit_value_at_bet,
      coalesce(r.status, 'pendente'), r.gross_return, r.net_profit,
      r.estimated_probability, r.implied_probability, r.edge, r.ev,
      r.kelly_fraction, r.recommended_stake, r.clv,
      coalesce(r.tags, '{}'::text[]), r.tipster, r.notes, r.external_link,
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
