# Plano de refatoração em camadas — `aposta-controlada-main`

**Data:** 2026-07-26
**Destino:** agente executor externo (sessão/cota separada)
**Origem:** revisão de arquitetura em plan mode + verificação parcial por grep

---

## 0. Como ler este plano

### 0.0 Pré-condições de segurança — conferir ANTES de escrever qualquer linha

**Nada neste plano é autorizado a começar antes destes cinco checks passarem.**

**1. Confirmar que é repo git e registrar o baseline.**

```sh
git rev-parse --is-inside-work-tree   # esperado: true
git log -1 --oneline                  # anote este SHA: é o ponto de retorno
```

Referência na data de escrita deste plano: `1de815c feat(bookmakers): adiciona casa Pitaco com logo`, branch `main`, árvore limpa. Se o baseline divergir muito disso, o código pode ter mudado desde a revisão e **toda coordenada ⚠️ do plano fica ainda menos confiável**.

**2. Árvore limpa — e o que fazer se não estiver.**

```sh
git status --short   # esperado: vazio
```

Se aparecer **qualquer** coisa — modificado ou untracked — **PARE e relate**. Não commite, não stashe, não limpe.

> **Proibido em qualquer circunstância:** `git clean`, `git reset --hard`, `git checkout -- .`, `git restore .` — ou qualquer comando que descarte alterações. Arquivos untracked não são protegidos pelo git; um único `git clean` os apaga sem recuperação. Este repo já teve arquivos de trabalho em andamento (um HANDOFF e três CSVs de triagem) parados como untracked. Se você encontrar untracked, presuma que é trabalho de alguém e **não toque**.

**3. Branch dedicada. Nunca trabalhar em `main`.**

```sh
git switch -c refactor/camadas
```

Uma branch por camada é preferível (`refactor/L0-deadcode`, `refactor/L1-puras`, ...), porque as camadas têm perfis de risco muito diferentes e L3 pode ser abandonada sem arrastar L0–L2.

> **Proibido:** commitar em `main`; `push --force`; rebase de histórico já publicado.

**4. Antes de cada commit, conferir que só mudou o previsto.**

```sh
git diff --stat
```

Se aparecer arquivo que o item não menciona, **PARE e relate**. Refatoração que vaza para arquivo não previsto é sinal de que a premissa do item estava errada.

**5. Rollback por item — `revert`, não `reset`.**

Cada item é um commit isolado exatamente para isto:

```sh
git revert <sha-do-item>     # desfaz um item
```

Para desfazer uma camada, reverta os commits **na ordem inversa** da aplicação. Nunca use `reset --hard` para desfazer: ele descarta trabalho vizinho junto.

**Se o build quebrar e a causa não for óbvia em um olhar:** `git revert` do item e relate. **Não empilhe correções** sobre um item quebrado — é assim que uma refatoração sem teste vira debugging cego.

### 0.1 Estado de verificação das coordenadas

Este plano tem **dois níveis de confiança** e eles estão marcados item por item:

- ✅ **VERIFICADO** — confirmado por grep nesta sessão. Caminho e linha confiáveis na data acima.
- ⚠️ **NÃO VERIFICADO** — herdado da revisão de arquitetura original, **não conferido**. A revisão original já se provou errada em dois pontos (ver §0.3). Trate toda coordenada ⚠️ como hipótese.

**Regra dura:** para qualquer item ⚠️, o passo 0 é confirmar que o arquivo existe, que a faixa de linhas contém o que o plano afirma, e que o trecho a substituir é único no arquivo. Se divergir, **pare e relate** em vez de adaptar por conta própria — divergência pode significar que o código mudou desde a revisão e que a premissa do item caiu.

### 0.2 Regras de execução

1. **Um item = um commit.** Nenhum item deste plano depende de outro dentro da mesma camada.
2. **Gate de build a cada item:** `npm run build` (ou `npx tsc --noEmit` se for mais rápido) tem de passar antes do commit. Nenhum item aqui deveria alterar comportamento observável.
3. **Nenhum item deste plano é autorizado a mudar comportamento.** São todos refatorações de estrutura. Se um item exigir decisão de comportamento para prosseguir, pare e relate.
4. **Não invente escopo.** Se um arquivo vizinho parecer precisar de conserto, anote e siga.
5. **Camadas são sequenciais; itens dentro de uma camada são paralelos.** Não comece L2 antes de L1 fechar; L3 depende de L2.
6. **Sem testes? Escreva o teste de caracterização primeiro.** Vale para todo item de L3.

### 0.3 Correções à revisão original (não repetir os erros)

A revisão de arquitetura que originou este plano continha três defeitos já corrigidos abaixo:

1. **Subcontou `normText`:** afirmou 5–6 cópias; são **7**. Faltava `scripts/populate-board.mjs:20`, que é um terceiro re-implemento do pipeline de tênis num terceiro boundary (script Node, fora de client e edge).
2. **Omitiu `src/lib/flashscore.ts`** da lista de fontes de dados. É fonte de tênis (fallback), consumida dentro de `tennis.ts`, não por `searchEvents` — o que significa que a cascata de busca tem **dois níveis**, não um.
3. **Propôs solução errada para o boundary edge/client:** "Deno remote import" ou publicar em `jsr:`. Ver §L2.1 — ambos rejeitados.

---

## 1. Fatos verificados (base confiável)

| Fato | Evidência |
|---|---|
| `src/lib/oddsApi.ts` tem **zero importadores** | grep por `from ".*oddsApi"` em todo o repo: nenhum resultado |
| Existem **7** cópias de `normText` | `src/lib/tennis.ts:22`, `src/lib/sportsdb.ts:64`, `src/lib/mma.ts:29`, `src/lib/apisportsF1.ts:25`, `src/lib/oddsApi.ts:23`, `supabase/functions/tennis-refresh/index.ts:67`, `scripts/populate-board.mjs:20` |
| `tennis-refresh` declara a duplicação em comentário | `supabase/functions/tennis-refresh/index.ts:65` — "MESMA normalização do cliente (src/lib/tennis.ts normText)" |
| `populate-board.mjs` duplica também `tour` e `hay` | `scripts/populate-board.mjs:53` (norm de tour), `:68` (montagem do hay) — mesma lógica de `tennis-refresh/index.ts:104` |
| `flashscore.ts` já é parser puro | exporta `deriveTour:49`, `parseFlashscoreMatches:77`, `tennisPlayerIdsFromSearch:108`; sem I/O próprio |
| `flashscore.ts` é consumido só por `tennis.ts` | `src/lib/tennis.ts:7`; cascata em `tennis.ts:265-307` |
| Arquivos confirmados existentes | `tennis.ts`, `sportsdb.ts`, `mma.ts`, `apisportsF1.ts`, `oddsApi.ts`, `flashscore.ts`, `tennis.test.ts`, `flashscore.test.ts`, `tennis-refresh/index.ts`, `Bankroll.tsx` |
| Arquivos **não** confirmados | `Dashboard.tsx`, `Analytics.tsx`, `Bets.tsx`, `Calendar.tsx`, `metrics.ts`, `insights.ts`, `analyticsUrl.ts`, `analyticsUrl.test.ts`, `apisports.ts`, `apisportsMulti.ts`, `telegram-webhook/index.ts` — existência assumida pela revisão original |

---

## L0 — Deleções verificadas

Risco nulo. Nenhuma dependência. Faça primeiro.

### L0.1 — Deletar `src/lib/oddsApi.ts` ✅ VERIFICADO

**Objetivo:** remover código morto.

**Ação:**
1. Reconfirmar zero importadores: `rg "oddsApi" --type ts --type tsx` (esperado: só o próprio arquivo).
2. `git rm src/lib/oddsApi.ts`.
3. Se houver `src/lib/oddsApi.test.ts`, remover também.

**Aceite:** build passa; nenhuma referência restante a `oddsApi` no repo.

**Atenção:** a revisão original afirma que a lógica de `oddsApi.ts` está inlinada em `mma.ts:96-120` (⚠️ não verificado). **Não** extraia nem unifique isso agora — a deleção é independente e a unificação pertence a L2.3. Se a deleção quebrar o build, a premissa "zero importadores" caiu: pare e relate.

---

## L1 — Funções puras, sem I/O

Nada aqui toca rede, Supabase ou estado global. Todos testáveis de imediato. Itens independentes entre si.

### L1.1 — Fazer `Analytics.tsx` usar `getBetGroupKey` ⚠️ NÃO VERIFICADO

**Melhor custo/benefício do plano inteiro.** Não cria módulo novo; faz a página usar o módulo canônico que já existe.

**Problema:** `Analytics.tsx:146-161` teria 11 lambdas inline de agrupamento (`(b) => (b.sport && b.sport.trim()) || "—"` e variantes) que re-codificam `analyticsUrl.ts:36-63` (`getBetGroupKey`). As duas implementações **têm de concordar** para o drill-down por deep-link funcionar, e nada garante isso. A cópia da lib tem teste (`analyticsUrl.test.ts:97-125`); a da página não.

**Ação:**
1. Confirmar que `getBetGroupKey` existe em `src/lib/analyticsUrl.ts` e ler sua assinatura exata.
2. Confirmar as 11 lambdas em `Analytics.tsx`.
3. **Antes de trocar:** verificar que cada lambda inline produz exatamente a mesma chave que `getBetGroupKey` para a aba correspondente. Se alguma divergir, **isso é um bug pré-existente de deep-link** — pare, relate a divergência, não "conserte" escolhendo um lado.
4. Substituir por `groupBy(settled, (b) => getBetGroupKey(b, tab))` dirigido por um loop sobre as abas.

**Aceite:** build passa; `analyticsUrl.test.ts` continua verde; drill-down manual de ao menos duas abas continua abrindo o filtro correto.

**Risco:** baixo, mas é o único item de L1 que toca contrato de URL. Se houver divergência no passo 3, o item vira relatório, não commit.

### L1.2 — Extrair `useRechartsTouchDismiss` ⚠️ NÃO VERIFICADO

**Problema:** efeito de ~38 linhas byte-idêntico em `Dashboard.tsx:36-73` e `Analytics.tsx:36-73`.

**Ação:**
1. Ler **apenas** as faixas `:30-80` de cada arquivo (não o arquivo inteiro — economia deliberada).
2. Confirmar que os dois blocos são idênticos. Se divergirem, relate a diferença antes de unificar.
3. Criar `src/hooks/useRechartsTouchDismiss.ts` com o efeito.
4. Substituir os dois blocos por uma chamada do hook.

**Aceite:** build passa; comportamento de dismiss por toque nos gráficos preservado nas duas páginas (verificação manual em viewport mobile).

**Risco:** mínimo. Puro ganho de manutenção — nenhum bug depende disso.

### L1.3 — Estender `lib/metrics.ts` com `timeseries()` ⚠️ NÃO VERIFICADO

**Problema:** seis call sites re-dobram a mesma série `bet_date → net_profit` com reducers próprios, e ao menos dois divergiram:

- `Dashboard.tsx:95-123` (cumChart), `:125-144` (byMonth com gap fill)
- `Analytics.tsx:163-181` (peak + drawdown)
- `Bankroll.tsx:48-81` (evolucaoBanca)
- `Calendar.tsx:29-41` (byDay: profit + count)
- `insights.ts:64-67` (`drawdownOf` — o único já extraído; prova que a abstração existe)

**Ação:**
1. Ler as seis faixas. Tabular as divergências **antes** de escrever a assinatura.
2. Projetar `timeseries(settled, opts)` com `opts: { bucket: "day"|"month"; from?; to?; fillGaps?; mode: "cumulative"|"delta"; includeDrawdown? }` retornando `{ t, value, drawdown? }[]`.
3. Escrever testes unitários da nova função **antes** de migrar os call sites (ela é pura; não há desculpa).
4. Migrar os seis call sites um a um, um commit cada.
5. Manter `computeMetrics` como está — ele é o snapshot escalar, não a série.

**Aceite:** build passa; testes novos verdes; cada gráfico renderiza os mesmos pontos que antes (comparar visualmente, ou logar as séries antes/depois).

**Atenção:** onde duas implementações divergirem (ex.: dois cálculos de drawdown diferentes), **a divergência é a descoberta** — relate qual comportamento você escolheu e por quê. Não unifique silenciosamente.

### L1.4 — Extrair `lib/betsWindow.ts` ⚠️ NÃO VERIFICADO

**Problema:** o predicado "filtrar apostas por janela + status + esporte" está inline 4×, mais uma variante sem status:

- `Bets.tsx:185-208`
- `Analytics.tsx:108-139` (inclui o gêmeo sem status em `:127-139`)
- `Dashboard.tsx:184-200`
- `Calendar.tsx:48-63`
- `insights.ts:57-67` já tem um `inWindow` privado — a abstração já existe, só não foi promovida

Além disso `Bets.tsx` teria presets de janela próprios (`QUICK_RANGES`/`localISO`) duplicando `constants.ts:RANGE_PRESETS` e `analyticsUrl.ts:presetStartDate`.

**Ação:**
1. Ler as cinco faixas + `insights.ts:57-67` + os dois conjuntos de presets.
2. Projetar em duas peças, não uma: uma primitiva `filterByDate(bets, from, to)` e um composto `filterBets(bets, predicate)`. O caso duplo-filtro da Analytics tem de **compor**, não virar um flag `includeStatus: false` — flag booleano em predicado é sinal de duas funções mal fundidas.
3. Testes unitários primeiro.
4. Migrar call sites, um commit cada.
5. Unificar os presets de janela num único lugar (decidir entre `constants.ts` e `analyticsUrl.ts`; preferir `constants.ts` se `analyticsUrl.ts` importar dele sem ciclo).

**Aceite:** build passa; testes verdes; contagens de apostas exibidas em cada página inalteradas para o mesmo filtro.

---

## L2 — Módulos de boundary

Aqui o código atravessa fronteiras de runtime (Vite/browser ↔ Deno/edge ↔ Node/script). **L2.1 é bloqueante para L2.2.**

### L2.1 — `normText` compartilhado via `supabase/functions/_shared/` ✅ coordenadas VERIFICADAS

**Problema:** 7 cópias da mesma função, em 3 runtimes. A cópia edge↔client é mantida em sincronia **por um comentário** (`tennis-refresh/index.ts:65`). Se ela driftar, o `ilike` do `searchTennisDb` para de casar com o `hay` gravado pelo cron — falha silenciosa de busca, sem erro.

**Decisão de arquitetura (já tomada — não reabrir):**

- ❌ **Rejeitado:** Deno remote import da cópia do client. Cria dependência de rede no cold start da edge function.
- ❌ **Rejeitado:** publicar package em `jsr:`. Desproporcional para uma função de 3 linhas.
- ✅ **Adotado:** módulo único em `supabase/functions/_shared/text.ts`, com alias no Vite (`vite.config.ts`) para o client importar do mesmo arquivo. `scripts/populate-board.mjs` importa por caminho relativo.

**Ação:**
1. Criar `supabase/functions/_shared/text.ts` exportando `normText`.
2. Adicionar alias em `vite.config.ts` (ex.: `"@shared"` → `supabase/functions/_shared`). Conferir se `tsconfig.json` precisa do `paths` correspondente.
3. Substituir as 7 cópias por import. Ordem sugerida: edge primeiro (`tennis-refresh`), depois client, depois script.
4. Conferir que as 7 implementações são **realmente idênticas** antes de unificar. `populate-board.mjs:20` usa `\p{M}` com flag `u`; confirmar que as demais também — se alguma normalizar diferente, **é bug**, relate.
5. Teste unitário de `normText` (não existe hoje) cobrindo acento, caixa, trim e o caso de barra em duplas.

**Aceite:** build passa; `tsc --noEmit` limpo; deploy da edge function `tennis-refresh` bem-sucedido; **e** uma query de verificação confirmando que o `hay` gravado após o novo deploy casa com a normalização do client.

**⚠️ Cota:** o refresh de tênis tem limite de 50 execuções/dia. **Antes** de re-executar o cron para validar, rode a query de verificação no banco para ver se a execução já aconteceu. Não gaste cota repetindo.

### L2.2 — `tennis-shared.ts`: unificar contrato client/edge/script ⚠️ parcialmente verificado

**Depende de L2.1 ter provado o padrão `_shared/`.**

**Problema:** o `toRow` do cron e o `toEvent` do client re-implementam o mesmo mapeamento `BoardMatch → (row|event)` em paralelo, e **já divergiram**: a edge sintetiza `match_id` negativo (`tennis-refresh/index.ts:105-109`) e o client confia nessa fórmula via comentário (`tennis.ts:100`), sem tipo compartilhado. `scripts/populate-board.mjs` é uma terceira cópia. `fnv1a`, `toRow`, dedup, prune e upsert do cron não têm teste algum.

**Ação:**
1. Ler `tennis-refresh/index.ts` inteiro (267 linhas), `tennis.ts:81-121` e `:169-193`, e `populate-board.mjs`.
2. Tabular as divergências entre as três implementações antes de escrever qualquer código.
3. Criar `supabase/functions/_shared/tennis.ts` exportando: tipos `BoardMatch` e `CachedRow`, `toRow`, `toEvent`, a fórmula de id sintético, e os predicados de jogador-desconhecido e de duplas.
4. Testar `toRow` e `toEvent` isoladamente — é o ganho principal do item.
5. Introduzir `interface TennisCacheStore` e injetá-la, para que as chamadas inline `supabase.from('tennis_matches_cache')...` em `tennis.ts` passem por ela. Isso permite substituir o mock da builder chain em `tennis.test.ts:7-15` por um fake simples.
6. Migrar os três consumidores.

**Aceite:** build passa; `tennis.test.ts` e `flashscore.test.ts` verdes; deploy da edge OK; **query de verificação no banco** confirmando que as linhas gravadas pelo novo cron são idênticas em forma às antigas (comparar uma amostra antes/depois, atenção especial ao sinal de `match_id`).

**Risco:** alto para a camada. A fórmula de id sintético é invariante compartilhada não tipada — se você errar o sinal, a busca do client para de casar sem erro visível. Trate a fórmula como contrato e escreva um teste que a fixe.

**⚠️ Cota:** mesma restrição de 50/dia de L2.1.

### L2.3 — Unificar os adapters MMA duplicados ⚠️ NÃO VERIFICADO

**Problema:** o bloco de fontes MMA do API-Sports estaria duplicado verbatim entre `mma.ts:125-172` e `apisportsMulti.ts:134-198`, e já driftou — uma cópia guarda a season numa const, a outra chama `getSeason()` quatro vezes.

**Ação:**
1. Confirmar as duas faixas e diffar as duas cópias.
2. Extrair um `ApisportsMmaAdapter` único. Se a divergência de season mudar resultado (fronteira de virada de ano), **relate antes de escolher**.
3. Apontar os dois call sites para o adapter.

**Aceite:** build passa; busca manual de um evento MMA conhecido retorna o mesmo resultado que antes.

---

## L3 — Seams atrás de função-deus

**Passo 0 obrigatório de toda a camada: teste de caracterização antes de qualquer refactor.** Estes alvos não têm teste e seu comportamento é definido pela sequência atual de execução.

### L3.1 — Colapsar a cascata `outcome.status` no `telegram-webhook` ⚠️ NÃO VERIFICADO

**Escopo deliberadamente estreito.** A revisão original juntava isto com a troca do REST client — **separado de propósito** (ver L3.2).

**Problema:** três `switch (outcome.status)` quase idênticos copiados entre os handlers de texto, foto e correção: `index.ts:232-260`, `:271-300`, `:340-369`. Risco de drift no branch "unavailable".

**Ação:**
1. Diffar os três switches. Enumerar toda diferença.
2. Extrair `respondToOutcome(outcome, ctx, { ok, unreadable, unavailable })`.
3. Se os três divergirem em algo além das mensagens, **pare e relate** — pode ser intencional.

**Aceite:** build passa; deploy OK; teste manual dos três caminhos (texto, foto, correção) no bot.

### L3.2 — Trocar o REST client hand-rolled por `supabase-js` ⚠️ NÃO VERIFICADO — **item separado, não fundir com L3.1**

**Problema:** `telegram-webhook/index.ts:55-141` implementa à mão um cliente REST de 5 métodos usado em 11 sites, embora `tennis-refresh/index.ts:21-24` já use o `@supabase/supabase-js` canônico.

**Por que é item próprio:** o Telegram re-tenta o webhook em timeout. Trocar o cliente altera bundle size e cold start **no caminho crítico de um endpoint com retry**. Risco de natureza diferente do L3.1 — não pode viajar no mesmo commit.

**Ação:**
1. Extrair `interface BetsStore` cobrindo os 11 sites de acesso, com a implementação REST atual por trás. Commit.
2. Só então trocar a implementação por `supabase-js`. Commit separado.
3. Medir cold start antes e depois. Se piorar de forma relevante, **reverta o passo 2 e mantenha o passo 1** — o seam é o ganho durável; a troca de cliente é opcional.

**Aceite:** build passa; deploy OK; bot responde dentro do timeout do Telegram; handlers testáveis com um `BetsStore` fake.

**Bônus opcional (commit próprio):** mover o roteamento de comandos (`/start`, `/vincular`, `/pausar`, `/retomar`) para um registry `Map<command, Handler>`.

### L3.3 — Seam `SportsDataSource` atrás de `searchEvents` ⚠️ NÃO VERIFICADO — **último item do plano**

**Deixado para o fim de propósito.** É o item de maior risco: `sportsdb.ts:188-343` é uma cascata de ~155 linhas que mistura fetch, fusão, dedupe, roteamento por rótulo de esporte, cache e quota, e **não tem teste**. O único oráculo hoje é "a busca ainda acha a partida". Refatorar isso para interface antes de existir teste de caracterização é o caminho canônico para regressão silenciosa.

**Escopo real (maior do que a revisão original afirmava):**
- `searchEvents` importa concretamente 5 adapters: `tennis.ts`, `mma.ts`, `apisportsF1.ts`, `apisports.ts`, `apisportsMulti.ts` — cada um com assinatura ad hoc.
- ✅ **Há um sexto nível não mencionado na revisão:** `flashscore.ts` é fonte de tênis consumida **dentro** de `tennis.ts:265-307`, com circuit breaker próprio (Matchstat primário → Flashscore fallback, breaker de 10 min). Logo a cascata tem **dois níveis** e o seam em `searchEvents` **não cobre** o nível interno de tênis. Decida explicitamente se L3.3 inclui o nível interno ou só o externo — recomendação: **só o externo**, e o interno vira item futuro.
- O bloco que sempre dobra F1/tênis/MMA como secundários (`sportsdb.ts:269-292`) é política hardcoded.

**Ação:**
1. **Teste de caracterização primeiro.** Fixar entradas/saídas de `searchEvents` para ao menos: um caso por esporte, um caso de matchup (`A vs B`), um caso de cache hit, um de fonte primária falhando com fallback. Sem isso, não prossiga.
2. Definir `interface SportsDataSource { sportLabel; priority; appliesTo(query): boolean; search(query, signal): Promise<SportEvent[]> }`. **Use `flashscore.ts` como template** — ele já tem a forma certa (parser puro, sem I/O, retorna `SportEvent[]`).
3. Adaptar os 5 adapters à interface, um commit cada, teste de caracterização verde a cada passo.
4. Converter a política hardcoded de `:269-292` em `appliesTo()` por fonte.
5. `searchEvents` passa a ser fusão sobre uma lista `sources[]` registrada por esporte.

**Aceite:** testes de caracterização verdes e **inalterados** em todos os passos; busca manual de um evento por esporte retorna o mesmo resultado que antes.

**Critério de parada:** se o teste de caracterização do passo 1 revelar que o comportamento atual depende da ordem exata de execução de forma que a interface não consegue expressar, **pare e relate**. Isso é achado de projeto, não obstáculo a contornar.

---

## 2. Decisões em aberto (não decidir sozinho)

1. **L2.1:** nome e formato do alias `_shared` no Vite + `tsconfig.paths`. Proposto `@shared`; confirmar que não colide com aliases existentes.
2. **L1.4:** presets de janela ficam em `constants.ts` ou `analyticsUrl.ts`? Preferir `constants.ts` se não criar ciclo de import.
3. **L3.3:** o seam inclui o nível interno de tênis (`flashscore` fallback + circuit breaker) ou só o externo? Recomendação: só o externo.
4. **L3.2:** manter ou não a troca para `supabase-js` depois de medir cold start.

## 3. Fora de escopo

- Nenhuma mudança de comportamento, de UI ou de schema.
- Nenhum item novo que não esteja neste plano.
- Não criar `CONTEXT.md` nem ADRs sem pedir — mas **registrar** as decisões de §2 conforme forem tomadas.
