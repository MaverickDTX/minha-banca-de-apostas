-- Canoniza o nome da casa de apostas na escrita.
--
-- Motivação: `bet365` e `Bet365` coexistiam (65 contra 1427 apostas), e
-- `betnacional`/`BetNacional` (2 contra 3), gerando entradas duplicadas na aba
-- Análises — que agrupa pela string crua de `bets.bookmaker`, como faz com `market`.
--
-- O logo NÃO era afetado: `getBookmaker()` em src/lib/bookmakers.ts já resolve por
-- `value.trim().toLowerCase()`. O defeito é exclusivamente de agregação.
--
-- Mesma escolha da migration de btrim: a garantia fica no banco, não no client,
-- porque o campo é escrito por três caminhos (BetForm, edição e ImportExport) e
-- normalizar em um só já se mostrou insuficiente.
--
-- Casa desconhecida continua entrando livre: o objetivo é unificar grafia de casa
-- conhecida, não travar o cadastro de casa nova.

create table if not exists public.bookmaker_canonical (
  slug text primary key,
  name text not null
);

comment on table public.bookmaker_canonical is
  'Grafia canônica das casas conhecidas. Espelha BOOKMAKERS em src/lib/bookmakers.ts — manter os dois em acordo ao adicionar casa nova.';

alter table public.bookmaker_canonical enable row level security;
revoke all on public.bookmaker_canonical from anon, authenticated;
grant select on public.bookmaker_canonical to authenticated;

drop policy if exists bookmaker_canonical_read on public.bookmaker_canonical;
create policy bookmaker_canonical_read on public.bookmaker_canonical
  for select to authenticated using (true);

insert into public.bookmaker_canonical (slug, name) values
  ('bet365','Bet365'), ('betano','Betano'), ('betfair','Betfair'),
  ('sportingbet','Sportingbet'), ('kto','KTO'), ('superbet','Superbet'),
  ('estrelabet','Estrela Bet'), ('pixbet','Pixbet'), ('blaze','Blaze'),
  ('novibet','Novibet'), ('betnacional','BetNacional'), ('betwarrior','BetWarrior'),
  ('betsson','Betsson'), ('stake','Stake'), ('galera','Galera.bet'),
  ('esportesdasorte','Esportes da Sorte'), ('f12bet','F12.bet'), ('pinnacle','Pinnacle'),
  ('betmgm','BetMGM'), ('esportivabet','Esportiva.bet'), ('pitaco','Pitaco'),
  ('sportsbet.io','Sportsbet.io')
on conflict (slug) do update set name = excluded.name;

-- Resolve pela grafia exata (lower do name) ou pelo slug; devolve a entrada
-- original quando a casa é desconhecida.
create or replace function public.canonical_bookmaker(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select c.name from public.bookmaker_canonical c
      where lower(c.name) = lower(btrim(p_value)) or c.slug = lower(btrim(p_value))
      limit 1),
    nullif(btrim(p_value), '')
  );
$$;
