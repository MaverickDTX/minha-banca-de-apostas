# Plano técnico — Reescrita do autocomplete de tênis (redução de cota)

Status: **fases 1 e 2 implementadas** (fase 2 aguardando deploy). Atualizado: 2026-07-19.

**Fase 1 (§10) — no ar:** board `ms-api/upcoming` + histórico -7d..-1d no cliente,
edge function com passthrough allowlisted, 151 testes verdes.

**Fase 2 (§9) — implementada, pendente de deploy:** decisões §9.7 fechadas em
2026-07-19 (pg_cron+pg_net → edge function; SELECT direto com RLS; poda -8d +
stale de upcoming 2×TTL). Entregues: migration `20260719130000_tennis_matches_cache.sql`
(tabela + trgm + RLS + cron 6h), edge function `tennis-refresh` (ciclo de 3
chamadas, guarda de frescor de 2h, shared secret do Vault), cliente cache-first
(`searchTennisDb`; legado fase 1 vira fallback para tabela vazia/stale >24h).
Pendências de deploy: criar `TENNIS_REFRESH_SECRET` no Vault, `supabase db push`,
`supabase functions deploy tennis-refresh --no-verify-jwt`, push do front.
Escopo pedido: reduzir a pressão sobre a cota da RapidAPI no caminho de
autocomplete de tênis, hoje baseado em paginação de fixtures por janela de data.

**Já aplicado:**
- Fix do bug do ITF em `src/lib/tennis.ts` + `supabase/functions/tennis-fixtures`
  + testes (151 testes verdes; 11 em `tennis.test.ts`; ver §1.2).
- Probe-tennis-api.mjs (testes empíricos standalone).
- Edge function `tennis-fixtures` publicada como versão 9 em 2026-07-19 00:23 UTC.

**Em proposta:**
- Reescrita para `ms-api/upcoming` + histórico curto (ver §3.2, §8).

**Item empírico pendente (não bloqueia o desenho, ver §5.1):**
- Teto absoluto aceito pelo parâmetro `limit`; o board atual já cabe em uma
  chamada a `limit=500`.

---

## 1. Diagnóstico do estado atual

### 1.1. Como funciona hoje (`src/lib/tennis.ts` + `supabase/functions/tennis-fixtures`)

O `searchTennisMatches(query)` monta um índice de nomes a partir de fixtures e
filtra localmente. Para cada busca que **não** bate no cache:

1. `loadWindow(recent)` — janela de -30d a -1d.
2. Se nada casar, `loadWindow(upcoming)` — janela de hoje a +14d.

Cada `loadWindow` chama `loadTour` para **3 tours** (`atp`, `wta`, `itf`), e cada
`loadTour` pagina até `MAX_PAGES = 3`. Pior caso por busca sem cache:

```
3 tours × 3 páginas × 2 janelas = até 18 invocações da edge function
```

Cada invocação é uma chamada real à RapidAPI (a edge function é um proxy fino).
O cache é por chave de janela (`start|end`) e há dedup in-flight por keystroke,
o que ameniza — mas a **primeira** digitação de cada janela paga o custo cheio.

### 1.2. Bug confirmado: `itf` não é um tourType válido

A doc de Fixtures (https://tennisapidoc.matchstat.com/fixtures) é explícita:

> the `{tourType}` path parameter only accepts `atp` or `wta`. There is no `itf`
> tour type. (…) Passing `itf` or `ITF` as the type will return a `400` error.
> ITF-level tournaments are included within ATP and WTA data — use `rankId=0`
> (ITF $10K) ou `rankId=1` (Challengers / ITF >$10K) to filter.

No código atual:

- `src/lib/tennis.ts` — `const TOURS = ["atp", "wta", "itf"] as const;`
- `supabase/functions/tennis-fixtures/index.ts` — a validação aceita
  `type === "itf"` e monta `https://…/tennis/v2/itf/fixtures/…`.

Efeito em cadeia, **custando cota agora**:

1. ~1/3 das invocações por busca vão para o tour `itf` → **400 garantido**.
2. `400` → envelope `ok:false` → `loadTour` retorna `complete:false`.
3. `complete:false` em qualquer tour torna a janela incompleta.
4. Janela incompleta **dispara o fallback do Flashscore** (`searchTennisFlashscore`),
   que consome a cota mensal de 500 da fonte secundária — sem necessidade, porque
   o primário na verdade funcionou para atp/wta.

Ou seja: o bug do `itf` não só desperdiça invocações no primário como provoca
**falsos disparos do fallback**, atacando as duas cotas ao mesmo tempo.

> Correção mínima (independente do redesenho): remover `itf` de `TOURS` e da
> validação da edge function. Se a cobertura ITF for desejada, ela vem por
> `rankId` dentro de atp/wta, não como tour próprio.
>
> **STATUS: APLICADO (2026-07-17).** `itf` removido de `TOURS` em
> `src/lib/tennis.ts` e da validação em `supabase/functions/tennis-fixtures/index.ts`;
> testes em `src/lib/tennis.test.ts` atualizados para 2 tours. O fix do cliente
> vale no próximo deploy do front; o da edge function exige
> `supabase functions deploy tennis-fixtures` (defesa em profundidade — o cliente
> já não envia mais `itf`). Falta confirmar o 400 empiricamente: ver
> `probe-tennis-api.mjs`, teste [0].

---

## 2. Por que `/search` **não** é a solução (correção da premissa)

`GET /tennis/v2/search?search={q}` (https://tennisapidoc.matchstat.com/misc)
faz `ILIKE '%q%'` sobre nomes de jogadores e torneios, ATP+WTA numa só chamada.
Porém o **schema de resposta do Player Result é explícito e tem 3 campos**:

```
name        string
birthday    string | null
countryAcr  string
```

**Não há `id`.** E todos os endpoints que retornam jogos de um jogador
(`/{tour}/fixtures/player/{playerId}`, `/{tour}/player/past-matches/{playerId}`)
exigem o id numérico. O único bridge nome→id no core seria enumerar
`/{tour}/player` (lista de ranking inteira, paginada) — mais caro que hoje.

Conclusão: `/search` entrega **identidade**, não confrontos nem id. Trocar a
paginação por `/search` deixaria o autocomplete sem os jogos para anexar à
aposta. Premissa inviável como formulada.

---

## 3. Solução de raiz proposta: feed consolidado `ms-api/upcoming/matches`

A doc confirma que o produto top-level ("Tennis API - ATP WTA ITF", que é o
assinado) **inclui todos os endpoints**, inclusive a MS API name-based.

`GET /tennis/v2/ms-api/upcoming/matches`
(https://tennisapidoc.matchstat.com/ms-upcoming-and-predictions)

- Retorna **todos os jogos futuros ATP+WTA numa só rota** (não por tour).
- Envelope: `{ total, matches: [...] }`.
- Cada match traz `tournament` (id, name, date, rankId, country, court),
  `date`, `type` (atp/wta), `roundId`, `h2h`, e:
  - `player1` / `player2` com **`id`, `name`, `countryAcr`, `seed`, `odd`, `image`**.
- Query params: `limit` (default 10), `page` (default 1), e no variante
  `/matches/{tourType}` há `group=singles|doubles`.

Dois ganhos decisivos sobre o desenho atual:

1. **Consolidação de tours**: 1 endpoint cobre atp+wta (multiplicador 3→1; e o
   `itf` deixa de existir como chamada).
2. **Traz o `id` do jogador** que faltava no `/search`. Isso reabre, se um dia
   for útil, o caminho name→id→`fixtures/player/{id}` sem enumerar rankings.

### 3.1. Estratégia de cache — o que realmente zera a cota

O feed de "próximos jogos" é um **board finito e compartilhado por todos os
usuários**. A mudança de arquitetura é:

- Hoje: paginação **por busca** (cada janela nova = até 18 chamadas).
- Proposto: carregar o board **uma vez**, indexar nomes, e servir **todo
  keystroke a partir do cache** (0 chamadas após o primeiro load).

Custo do load único = nº de páginas do board. Depende de `limit` máximo e do
tamanho do board (ver §5, item aberto). Ainda assim, o custo passa de
"por busca" para "por sessão/TTL", que é a diferença que alivia a cota.

### 3.2. Desenho `loadUpcomingBoard()` — parâmetros confirmados

Com a chave free (50 req/dia, §5.1), o desenho concreto:

- **Load único**: `GET /tennis/v2/ms-api/upcoming/matches?limit=500&page=1`.
  - O probe de 2026-07-19 retornou os **298 jogos** do board atual em uma chamada.
  - O teto absoluto de `limit` continua não documentado, mas não afeta o board
    atual; paginação só entra se uma carga futura devolver exatamente 500 itens.
- **Cache TTL ligado à cota**: como o free são 50/dia, o board pode ser recarregado
  no máximo ~10x/dia. TTL de **2h** (12 reloads/dia = ~12-24 chamadas) é o teto
  prático no free; **6h** (4 reloads/dia) é conservador e provavelmente suficiente
  para um board que só muda entre turnos de torneio. A constante `BOARD_TTL_MS`
  fica definida no código; começa em 6h e baixa se observarmos alteração real.
- **Decisão do §3.2 fechada**: `upcoming + histórico curto` (escolhido pelo
  usuário). Detalhes do histórico em §8.
- **Filtro de doubles**: nomes `"A/B"` filtrados localmente por `/` no nome, como
  o `/search` já faz. Sem custo de chamada extra.
- **Filtro de tour**: `match.type` (`atp`/`wta`) já vem no item — não há chamada
  por tour. Somente `ms-api/upcoming/matches` (sem `{tourType}`) cobre ambos.
- **Circuit breaker**: 429 no load do board dispara o fallback Flashscore e
  marca `_circuitOpen` por N min (como hoje). Fallback só dispara em falha
  **real** do primário (não mais em 400 de `itf`).

---

## 4. Mudanças necessárias (por arquivo)

### 4.1. `supabase/functions/tennis-fixtures/index.ts` (edge function — exige deploy)

O proxy hoje tem dois modos: matchstat fixtures (`type/start/end`) e flashscore
(`provider:"flashscore"` + `path`). Adicionar acesso ao `ms-api/upcoming`:

- **Opção A (preferida)**: um modo genérico de passthrough para o host matchstat,
  com **allowlist estrita de prefixos** para não virar open proxy. Ex.: permitir
  só paths que comecem com `/tennis/v2/ms-api/upcoming/` (e, se histórico entrar,
  `/tennis/v2/atp/fixtures/`, `/tennis/v2/wta/fixtures/`).
- **Opção B**: um modo dedicado `provider:"ms-upcoming"` com params tipados
  (`tourType?`, `group?`, `limit`, `page`) montando a URL internamente. Menos
  flexível, mas superfície de ataque menor.

Em ambas: remover `itf` da validação do modo fixtures legado.

> O fix ITF já foi publicado: `tennis-fixtures` versão 9, ativa desde
> 2026-07-19 00:23 UTC. A reescrita para `ms-api/upcoming` exigirá um novo deploy.

### 4.2. `src/lib/tennis.ts` (cliente)

- Remover `TOURS` com `itf`; o conceito de "tour por chamada" some no primário.
- Substituir `loadTour`/`loadWindow` (paginação por janela) por um
  `loadUpcomingBoard()`: pagina `ms-api/upcoming/matches` até esgotar `hasNext`/
  `total` ou um teto de páginas, **uma vez**, e cacheia o índice por TTL.
- Adaptar `toEvent` ao novo shape (`match.player1.name`, `match.player2.name`,
  `match.date`, `match.type`, `match.tournament.name`). Manter o `_hay` para o
  filtro local `matchesTennisQuery` (que não muda).
- **Doubles**: nomes vêm como `"A/B"`. Usar `group=singles` no fetch, ou filtrar
  quem tem `/` no nome (como o próprio `/search` já faz internamente).
- Circuit breaker: manter para 429 no load do board. Fallback Flashscore: manter,
  mas agora ele só dispara em falha **real** do primário (não mais em 400 de itf).

### 4.3. Testes (`src/lib/tennis.test.ts`)

- Atualizar mocks: o shape de resposta muda de `{ data:[fixtures] , hasNextPage }`
  para `{ total, matches:[...] }`.
- Adicionar caso que prova que **não** há mais chamada a tour `itf`.
- Adicionar caso de cache-hit: segunda busca na mesma sessão = 0 chamadas.
- Manter os casos de `matchesTennisQuery` (lógica inalterada).

---

## 5. Riscos e itens em aberto (verificar antes de codar)

1. **Teto absoluto de `limit`**: a doc não declara máximo. O probe mostrou que
   `limit=500` e `limit=1000` retornam os 298 jogos disponíveis no momento; isso
   não distingue teto do endpoint de tamanho do board. Paginar se uma resposta
   devolver exatamente 500 itens.
2. **TTL do cache do board**: board de "próximos jogos" muda ao longo do dia
   (jogos saem ao serem jogados, novos entram). Definir TTL (ex.: 15–30 min) que
   equilibre frescor × cota. Hoje o cache de janela não expira na sessão.
3. **Cache compartilhado**: decidir se o cache permanece por cliente ou se será
   persistido/populado por cron (esboço em §9).

### 5.1. Resultado empírico do probe

Rodado em `probe-tennis-api.mjs` com a chave free (secret do Vault; **não**
transcrever a chave aqui). A primeira rodada de 2026-07-17 encontrou `429`
pendentes.

| Teste | Resultado | Veredito |
|---|---|---|
| [0] `itf` = 400? | `itf=400, atp=200` | **CONFIRMADO** |
| [1] `limit` | limit=10→10, 100→100, 500→298, 1000→298 | Board atual = 298; teto absoluto inconclusivo |
| [2] board | `limit=500` → 298 itens em uma chamada | **1 chamada** no board atual |
| [3] odds | 87 de 232 itens tinham odds | **Disponíveis** no plano atual |
| [4] rankId ITF | `0: 52`, `1: 95`, `2: 85` | **Cobertura ITF/Challenger confirmada** |

**Descoberta crítica — free tier = 50 req/dia.** O plano free do produto tem
**50 requests diários** (confirmado pelo usuário via painel RapidAPI). A doc
oficial só declara "100 req/min por IP server-side"; o reset diário não está
documentado no endpoint — é uma quota do RapidAPI pela assinatura, não da API.

Consequência para o desenho:

- A cota **dita o TTL do cache**, não é um detalhe: com 50/dia, cada chamada
  custa ~2% da cota diária. O desenho legado estourava o free em poucas buscas
  (pré-fix: até 18/busca; pós-fix do `itf`: 12/busca — 2 tours × 3 págs × 2
  janelas). O `loadUpcomingBoard()` precisa custar **poucas chamadas/dia**,
  não "por busca".
- A escolha **upcoming + histórico curto** (§3.2) só é viável no free se o
  histórico for carregado **1x/dia** também, cacheado — não por busca.
- Odds e cobertura ITF/Challenger não são mais riscos abertos. O único dado ainda
  desconhecido é o teto absoluto de `limit`; a estratégia de paginação acima
  trata esse caso sem depender dele.

### 5.2. Tennis Stats API separado (2026-07-17)

Testado no host separado `tennis-stats-api.p.rapidapi.com`, que tem quota própria:

| Endpoint | HTTP | Resultado |
|---|---:|---|
| `/ms-api/upcoming/matches?limit=1&page=1` | 404 | Não existe nesse produto; não há board global alternativo. |
| `/ms-api/profile/search/Molcan/atp` | 200 | Retornou `["Alex Molcan"]`. |
| `/ms-api/profile/Alex%20Molcan/upcoming` | 200 | Retornou Alex Molcan x Damir Dzumhur, com data, torneio e odds. |

Os headers das respostas 200 indicaram `X-RateLimit-Requests-Limit: 50`,
`Remaining: 47` e `Reset: ~10.285s` (cerca de 2h51min naquele instante). Essa
quota é independente do produto top-level, mas só atende busca de jogador e
próximo jogo individual.

**Conclusão:** o Tennis Stats API não substitui `ms-api/upcoming/matches`.
Pode ser um fallback futuro com UX em duas etapas: buscar jogadores (ATP e WTA,
cache/debounce) e buscar o próximo jogo somente após a seleção. Não deve ser
usado para resolver todos os candidatos a cada keystroke.

### 5.3. Referência externa: como a bettin.gs faz (análise de tráfego, 2026-07-19)

Inspeção do tráfego (F12) do autocomplete de criação/edição de aposta da
bettin.gs. Padrão observado:

- **Search-as-you-type server-side, 1 request por caractere**:
  `GET api.bettin.gs/api/v1/account/bets/actions/matches?q={termo}` — dispara a
  cada tecla (`Shev`→`Shevc`→`Shevch`; `Sakk`→…→`Sakkari`; `Rubl`→…→`Rublev`),
  cada uma precedida de um preflight CORS `OPTIONS` (é cross-subdomain).
- **Segundo passo após a seleção**: escolhido o jogo, um
  `GET .../actions/match-selections/{matchId}` puxa as seleções (mercados) daquele
  confronto. Confirma o padrão de **duas etapas** (buscar → detalhar o escolhido).
- Backend próprio (`api.bettin.gs`, aparência de Laravel pelos parâmetros
  `filter[...]`, `per_page`, `sort=-id`). O search bate **no servidor deles**, não
  numa API externa com cota.

**Leitura para o nosso caso.** O luxo do "1 request/keystroke" só é sustentável
porque a busca deles não custa cota externa por tecla — o backend próprio já
espelha a base de partidas. Com o free de 50/dia da RapidAPI, replicar esse UX
batendo direto na API externa por keystroke é inviável (§5.1).

O que reconcilia UX igual + cota viável é exatamente a **§9**: board espelhado no
Supabase (populado por cron), e o "buscar por nome" vira query ao *nosso* Postgres
— sem cota por tecla, como a bettin.gs faz contra o Laravel dela. Ou seja, o
tráfego deles **valida a §9 como alvo**, não o cache em memória por sessão.

---

## 6. Sequência sugerida de implementação

1. **Quick win primeiro** (baixo risco, alto retorno imediato): remover `itf` de
   `TOURS` e da edge function. Só isso já para os 400 e os falsos fallbacks.
   Pode ir antes de qualquer redesenho.
2. Verificar itens 1–4 da §5 com chamadas reais (curl com a chave do Vault).
3. Implementar `loadUpcomingBoard()` + cache com TTL no cliente, atrás de um flag
   ou lado a lado com o caminho antigo, para comparar.
4. Ajustar edge function (allowlist) e **deploy** (você).
5. Atualizar testes; rodar `npm run build` (agora com `tsc -b`) e `npm test`.
6. Medir chamadas/keystroke antes e depois para confirmar o ganho.

---

## 7. Referências (doc oficial)

- Fixtures (regra do tourType, bug do itf): https://tennisapidoc.matchstat.com/fixtures
- Miscellaneous (schema do `/search`, sem id): https://tennisapidoc.matchstat.com/misc
- Players (todos exigem playerId): https://tennisapidoc.matchstat.com/players
- MS Upcoming & Predictions (feed proposto, com id): https://tennisapidoc.matchstat.com/ms-upcoming-and-predictions
- Base URLs / plano top-level inclui tudo: https://tennisapidoc.matchstat.com/

---

## 8. Caminho histórico curto (decisão §3.2: upcoming + histórico)

Escolhido pelo usuário: o autocomplete precisa casar jogos **recém-jogados**
(-7d a -1d), não só futuros. Esse caminho é **secundário** — não entra no hot
path; só roda uma vez/dia e cacheado, como o board.

### 8.1. Estratégia

- **Endpoint**: `GET /tennis/v2/{tour}/fixtures/{start}/{end}` para `atp` e `wta`
  (sem `itf` — bug já corrigido em §1.2). Parâmetros `pageSize`/`pageNo` como hoje.
- **Janela**: -7d a -1d (curta, não -30d como antes). Cobre "jogo que acabou há
  poucos dias / torneio em andamento"; evita custar 5x mais que o necessário.
- **Carga**: uma chamada por tour × janela (8 dias) com `pageSize` alto (teto
  ainda a confirmar por endpoint, mas a paginação legada usa `pageSize` / `pageNo`).
  Custo de load único: **2 chamadas** (atp + wta, 1 pág cada).
- **Cache TTL**: igual ao board (6h). O histórico muda pouco em 6h; a cota é a
  mesma, então o TTL sincroniza com `BOARD_TTL_MS`.
- **Indexação**: alimenta o mesmo índice de nomes que o board, marcando eventos
  como `_past: true` para eventual diferencição na UI (não altera `matchesTennisQuery`).

### 8.2. Orquestração do load diário

`loadTennisIndex()` (novo) corre a cada `BOARD_TTL_MS` ou no primeiro acesso:

1. `loadUpcomingBoard()` → 1 chamada no board atual (`ms-api/upcoming/matches`,
   `limit=500`; paginar somente se vierem 500 itens).
2. `loadRecentFixtures(-7d, -1d)` → 2 chamadas (`atp` + `wta`, fixtures legado).
3. Merge + indexação por nome → cache em memória (e/ou SessionStorage).

**Custo total diário no free tier (estimativa):**
- Cada ciclo = 3 chamadas no board atual.
- TTL de 6h = 4 ciclos/dia → **12 chamadas/dia**.
- No free de 50/dia, sobram **38 para fallback, adaptação e erro**.



### 8.3. Custo do desenho antigo vs. novo (com free tier 50/dia)

```
Desenho antigo (paginação por busca):
  pré-fix:  3 tours × 3 págs × 2 janelas = 18 chamadas / busca (~3 buscas/dia)
  pós-fix do itf (atual): 2 tours × 3 págs × 2 janelas = 12 / busca (~4 buscas/dia)

Desenho proposto (load + cache):
  3 chamadas × 4 ciclos/dia = 12 chamadas/dia (independente de buscas)
  Sobram 38 chamadas/dia para fallback/erro

Ganho: custo passa de "por busca" para "por dia".
       Buscas ilimitadas dentro do TTL.
```

---

## 9. Desenho: cache do board persistido via cron (arquitetura recomendada)

**Recomendação, não mais esboço.** Duas evidências convergem para persistir o
board no Supabase em vez de cachear em memória por sessão: (a) o free tier de
50 req/dia (§5.1) torna qualquer consumo *por usuário/reload* frágil; (b) o
tráfego da bettin.gs (§5.3) mostra que o padrão sustentável de "busca por nome"
é bater no *próprio backend*, não numa API externa por keystroke. A §9 replica
isso: o cron toca a RapidAPI; o cliente só toca o Postgres do projeto.

### 9.1. Princípio

O board de próximos jogos é **idêntico para todos os usuários**. Cache em memória
o recarrega por aba/reload/usuário — cota atada ao nº de usuários. Persistido, um
**cron único** popula a tabela e todos leem de graça. Consumo de cota fixo
(≈ nº de refreshes/dia), independente de usuários e de keystrokes.

### 9.2. Schema (mínimo)

Duas abordagens; recomendo a **A** pela simplicidade de leitura no autocomplete.

**A — uma linha por confronto (consulta direta, filtrável por nome):**

```sql
create table public.tennis_matches_cache (
  match_id      bigint primary key,        -- id do confronto no feed
  tour          text not null,             -- 'atp' | 'wta'
  rank_id       int,                        -- cobertura ITF/Challenger (0,1,2…)
  starts_at     timestamptz,                -- match.date
  tournament    text,
  player1_id    bigint, player1_name text,
  player2_id    bigint, player2_name text,
  hay           text not null,             -- normalizado p/ busca (p1+p2 sem acento)
  is_past       boolean not null default false, -- histórico curto vs. upcoming
  refreshed_at  timestamptz not null default now()
);
create index on public.tennis_matches_cache using gin (hay gin_trgm_ops); -- ILIKE rápido
create index on public.tennis_matches_cache (starts_at);
```

O índice `gin_trgm_ops` (extensão `pg_trgm`) dá `ILIKE '%termo%'` barato — é o
mesmo mecanismo do `/search` da MatchStat, agora no *seu* banco.

**B — um blob JSON por snapshot:** uma linha com `jsonb` do board inteiro. Mais
simples de escrever, mas o filtro por nome vira trabalho no cliente. Só vale se a
busca ficar 100% client-side. Recomendo A.

### 9.3. Cron (a função que gasta cota)

Uma **scheduled edge function** (ou `pg_cron` chamando a edge via `http`), a cada
`REFRESH_TTL`:

1. `loadUpcomingBoard()` — 1 chamada (board atual = 298; pagina se saturar §10.2).
2. `loadRecentFixtures()` — 2 chamadas (atp+wta, -7d..-1d).
3. `upsert` na `tennis_matches_cache` por `match_id`; marca `is_past` conforme a
   fonte; **deleta** linhas com `starts_at` já muito no passado (poda).

Custo por ciclo: **3 chamadas**. Orçamento diário (§5.1, 50/dia):

```
TTL 6h → 4 ciclos/dia → 12 req/dia   (sobram 38 para erro/retry/probe)
TTL 3h → 8 ciclos/dia → 24 req/dia   (mais fresco, ainda folgado)
```

Recomendo **começar em 6h** e baixar para 3h se o frescor incomodar. O board de
jogos futuros muda devagar; o histórico curto, menos ainda.

### 9.4. Leitura pelo cliente

O cliente **não** chama mais a edge de tênis no hot path. `searchTennisMatches`
vira uma query ao Supabase:

```sql
select * from public.tennis_matches_cache
where hay ilike '%'||:q||'%'
order by starts_at
limit 15;
```

Via `supabase.from(...).select().ilike('hay', ...)` ou uma RPC. Custo de cota
externa por keystroke: **zero** — exatamente o que a bettin.gs faz contra o
backend dela (§5.3). Debounce no cliente segue valendo (poupa o Postgres, não a
cota).

### 9.5. Invalidação e falha

- **Board stale > erro**: se o cron falhar num ciclo, o cliente segue lendo o
  último snapshot bom (a tabela persiste). Melhor servir dados de algumas horas
  atrás que nada.
- **`refreshed_at`**: o cliente pode exibir "atualizado há Xh" e, se muito velho
  (> 2× TTL), sinalizar degradação — sem quebrar a busca.
- **Fallback Flashscore**: deixa de ser hot-path. Só faria sentido para um jogo
  ausente do snapshot; opcional, avaliar depois.

### 9.6. Relação com a fase 1 (§10)

A fase 1 (`loadUpcomingBoard` / `loadRecentFixtures` / `toEvent`) é **reusada
inteira** pelo cron — só muda *quem* chama: em vez do cliente, a scheduled
function, gravando na tabela em vez de num `Map`. Por isso a fase 1 foi desenhada
agnóstica a cache. Ordem sugerida: implementar §10 (testável isolada) → montar a
tabela + cron da §9 → apontar o cliente para o Postgres.

### 9.7. Itens a decidir na implementação

- `pg_cron` + `http` vs. scheduled edge function (nativo do Supabase) — preferir o
  que o projeto já usa.
- RPC dedicada vs. `select` direto com RLS de leitura pública na tabela de cache.
- Poda: cutoff de `starts_at` no passado (ex.: −2d) para a tabela não crescer.

---

## 10. Plano de implementação — camada de fetch/normalização (fase 1)

**Decisão de escopo (usuário):** começar pela camada comum às duas arquiteturas
de cache (memória vs. Supabase/cron). O *onde persistir* fica para a fase 2; esta
fase entrega o fetch, a normalização, a paginação por saturação e o histórico
curto — tudo agnóstico a onde o resultado será guardado.

### 10.1. Contrato do endpoint (confirmado pelo probe)

`GET /tennis/v2/ms-api/upcoming/matches?limit={n}&page={p}` → `{ total, matches[] }`.

Cada item de `matches[]` (campos usados): `date` (ISO), `type` (`atp`/`wta`),
`tournament.{name,rankId}`, `player1.{id,name,odd?}`, `player2.{id,name,odd?}`,
`odds?`.

> **A validar no próximo probe (não bloqueia):** o feed expõe `hasNextPage`? O
> exemplo da doc só mostra `{ total, matches }`. A paginação abaixo não depende
> disso (usa `itens == limit`), mas se `hasNextPage`/`total` existir, é o sinal
> preferível.

### 10.2. `loadUpcomingBoard()` — assinatura e lógica

`async function loadUpcomingBoard(): Promise<{ events: IndexedEvent[]; complete: boolean }>`

- Fetch `limit=500&page=1` via proxy (edge function).
- **Paginação por saturação**: se `matches.length === 500` (ou `total > 500`),
  buscar `page=2…` até `matches.length < 500` ou esgotar `total`. Teto defensivo
  de páginas (ex.: 4) contra loop.
- Normaliza cada item com `toEvent` (§10.4).
- `complete=false` em 429/erro/timeout — mesma semântica de hoje, mantém o
  fallback Flashscore só em falha real.

### 10.3. `loadRecentFixtures()` — histórico curto

`async function loadRecentFixtures(): Promise<{ events: IndexedEvent[]; complete: boolean }>`

- `GET /tennis/v2/{atp|wta}/fixtures/{-7d}/{-1d}` — 2 chamadas (sem `itf`).
- Reusa a paginação legada (`pageSize`/`pageNo`) já existente em `loadTour`.
- Marca eventos com `_past: true` (para eventual distinção na UI).

### 10.4. `toEvent` — normalização unificada

Adaptar o `toEvent` atual ao shape do board (`match.player1.name`,
`match.player2.name`, `match.date`, `match.type`, `match.tournament.name`) e ao
shape legado do histórico. Ambos produzem o mesmo `IndexedEvent` com `_hay` —
`matchesTennisQuery` **não muda**. Filtrar doubles (`/` no nome).

### 10.5. Orquestração (agnóstica a cache)

`loadTennisIndex()`: `Promise.all([loadUpcomingBoard(), loadRecentFixtures()])`
→ merge + dedup por `id` → índice de nomes. A **fase 1 devolve o índice**; quem
chama decide se cacheia em memória (TTL) ou persiste (Supabase).
`searchTennisMatches` passa a filtrar sobre esse índice.

### 10.6. Mudança na edge function (exige deploy)

Passthrough allowlisted para `/tennis/v2/ms-api/upcoming/` (§4.1, Opção A). O modo
fixtures legado (atp/wta) já serve o histórico. Rejeição de `itf` já publicada (v9).

### 10.7. Casos de teste (fase 1)

- Board de 1 página (`< 500`) → 1 chamada, sem paginar.
- Board saturado (500 na p.1, resto na p.2) → pagina e concatena.
- 429 no board → `complete:false` → fallback dispara.
- Merge board+histórico sem duplicar (mesmo `id`).
- Cache-hit: 2ª busca no mesmo ciclo = 0 chamadas.
- Doubles (`"A/B"`) filtrados fora do índice.

### 10.8. Fora de escopo da fase 1

Persistência do cache (memória vs. cron/Supabase, §9), TTL definitivo, e o
fallback de 2 etapas via Tennis Stats API (§5.2). Entram na fase 2, com o custo
real por ciclo já medido.
