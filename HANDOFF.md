# Handoff — Bankroll Pro (minha-banca-de-apostas)

Data: 2026-07-08 (última atualização; histórico abaixo)

## ✅ Sessão 2026-07-08 (2) — Ajuste fino BetCard + tooltip recharts mobile

### BetCard — 4ª iteração
- **Evento**: `text-lg` (18px) → `text-[17px]`.
- **Separador da meta**: pipe `|` → bullet `•` como elemento flex separado entre cada parte, centralizado pelo `gap-x-1.5` do container. Pipe mantido no modo compacto (a pedido) e sublinhas de múltipla.
- **Demais fontes reduzidas em 1px**: seleção (`13px` → `12px`), meta (`text-xs`/12px → `11px`), valores de métricas (`text-sm`/14px → `13px`), rótulos de métricas (`10px` → `9px`), lucro líquido label (`12px` → `11px`), badges (`11px` → `10px`), leg badge (`9px` → `8px`). Compact mode: meta (`11px` → `10px`), valores (`14px` → `13px`).
- **Meta reposicionada**: movida para dentro do `flex-1 min-w-0` (antes era irmã do row principal, separada por `gap-3`), agora logo abaixo da seleção com `mt-1.5`. O `gap-3` do container agora só separa meta→métricas e métricas→lucro.
- **Hover efeito "elevar"** (só scale+shadow, sem ring — ring colidia com barra lateral de status): card cheio e compacto — ambos com `hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-xl` + `motion-safe:transition-all motion-safe:duration-200`.

### Tooltip recharts — dismiss inteligente em mobile (Dashboard + Análises)
O fix anterior disparava `mouseleave` em todos os charts em cada `touchend` — corria antes do recharts processar o toque, então o tooltip nunca aparecia. Novo comportamento: "tap no chart → mostra, tap fora → esconde". Um `touchstart` listener rastreia qual chart foi tocado; no toque seguinte fora dele, dispara `mouseleave` só naquele SVG. Comportamento natural de mobile, sem interferir no hover desktop.

### Estado de commit
- **Aguardando commit**: BetCard.tsx, Dashboard.tsx, Analytics.tsx, HANDOFF.md.
- Verificação: `tsc --noEmit` + `vitest run` (109/109) OK via fluxo canônico off-mount.

## ✅ Sessão 2026-07-08 — Refinamentos do BetCard iterados com o usuário + confirmação de exclusão em Banca

Sessão de ajustes diretos (sem agente), iterada com feedback visual do usuário sobre a rodada de consistência.

### BetCard (card cheio) — forma final após 3 iterações
- **Logo da casa: 32px (`size="sm"`) ao lado do evento** — decisão do usuário após testar (a) logo 16px na meta (ilegível, wordmark não sobrevive a 16px), (b) sem logo nenhum ("pobre"). Tooltip com o nome no hover.
- **Casa removida da linha de metadados** (texto e logo) — o logo no título já identifica; linha ficou "Futebol | FIFA World Cup | Simples | Pré-live | data".
- **Meta montada por array filtrada + join condicional** — esporte/liga vazios não deixam separador órfão.
- **Separador: pipe `|`** em todo o card (meta, compacto, sublinhas de múltipla). Testados antes: `·` (some em 11px) e `•`. Decisão do usuário.
- **Quick actions do hover: coluna vertical à direita** (`flex-col right-2 top-1/2 -translate-y-1/2`) — a barra horizontal no topo cobria o badge de status. Agora ocupa a zona morta ao lado das métricas.
- **Escala tipográfica final**: evento `text-lg` semibold (18px) → seleção 13px `text-foreground/80` → valores de métricas `text-sm` (14px, rótulos 10px) → meta `text-xs` (12px muted). Respiro `mt-1.5` entre seleção e badge.
- Modo compacto intocado (exceto separadores pipe).

### Banca — confirmação ao excluir transação
- A lixeira da tabela deletava direto (`deleteTx.mutate` no clique). Agora abre `AlertDialog` descrevendo o dado em risco ("Depósito de R$ X em DATA..."). Apostas já tinham confirmação (individual e lote) — o gap era só aqui.

### Sidebar — "Nova aposta" removido
- Ação, não destino; CTAs existem no Dashboard e em Apostas. Usuário confundia com a página "Apostas". (Commitado em `1d3c9a1`.)

### Estado de commit
- Commitados: sidebar, rodada consolidada, BetCard (logo/meta/quick actions), dialog de transação, BetCard.tsx (fontes 18/13/14/12px + separador pipe), HANDOFF.md.
- Verificação: `tsc --noEmit` OK via fluxo canônico off-mount.

### Backlog atualizado (ordem de relevância)
1. Tooltip do recharts preso após tap em mobile (Dashboard/Análises) — opcional, registrado na sessão mobile.
2. Teste mobile real das demais telas (Apostas, Análises, Banca, Nova aposta) — só o Dashboard foi validado em aparelho.
3. #26 constantes duplicadas (`DAY_NAMES` em 3 arquivos, `CHART_RANGES`/`PRESETS` em 2), #33 lint `unused-imports`, #32 tipos gerados não usados, #34 docs antigos, #35 tema claro com hue antigo.
4. #15b apagar conta (exige Edge Function com service role + confirmação forte).
5. Bot Telegram: converter testes #8 (401) e #9 (grants) em script curl/SQL; remover `getPendingBet()` morta no webhook.

## ✅ Sessão 2026-07-07 (4) — Rodada de consistência UI (8 telas)

### O que foi feito

**1. BetForm — "—" no painel calculado sem odd válida**
- `Prob. implícita` e `Lucro líquido (calc)` mostram "—" quando `effectiveOdds <= 1`, alinhando com `Retorno potencial` e `Lucro potencial`.

**2. BetForm — menores**
- Placeholder `"Ex: 1.85"` nos inputs de Odd (básico e avançado).
- Prefixo de moeda (R$/US$/€) no input Stake com `pl-9`; label `Stake (BRL)` → `Stake`.
- Grid do painel calculado: `md:grid-cols-4` → `md:grid-cols-5`.
- Tooltip (?) no toggle "Manter informações do evento" explicando a função.

**3. Bankroll — grid de KPIs, waterfall, hint, empty state**
- `xl:grid-cols-6` → `xl:grid-cols-5` (2 linhas simétricas de 5).
- `maxBarSize={120}` no waterfall "Composição da banca".
- Hint "= banca inicial (sem depósitos)" no ROI sobre capital quando igual ao ROI inicial.
- Empty state da tabela de transações com botão "Nova transação".

**4. Análises — dispersão Stake × lucro**
- `fillOpacity={0.55}` nos `<Cell>` do Scatter para revelar sobreposição de pontos.
- `domain` padding no Y para ponto extremo não colar na borda.

**5. `--accent` documentado**
- Comentário nos tokens light e dark: `/* ciano — quantidades neutras (contagens, composição); verde/vermelho = dinheiro/resultado */`.

**6. Bets — select de paginação truncado**
- Label `"20 por pág."` → `"20/pág"` para caber no trigger sem truncar.

**7. Import/Export — confirmado: botões já desabilitados quando count = 0.**

**8. BetCard — hierarquia reordenada (card cheio)**
- Evento como manchete (`font-semibold`), substituindo nome da casa.
- Seleção logo abaixo com `text-foreground/80`.
- Badge de status migrado para o canto superior direito.
- Casa com logo miniatura (16px) na linha de metadados.
- `pl-[52px]` removido das seções de conteúdo (logo não está mais à esquerda).
- Modo compacto (`compact`), quick actions, menu ⋯, borda lateral, expander de múltiplas preservados.

**Extra: tooltip do recharts — dismiss em touch (Dashboard + Análises)**
- `touchend` listener dispara `mouseleave` nos SVGs dos gráficos para tooltips não ficarem presos no mobile.

### Verificação
`tsc --noEmit`, `vitest run` (109/109) OK.

### Arquivos alterados
- `src/components/bets/BetForm.tsx`
- `src/pages/Bankroll.tsx`
- `src/pages/Analytics.tsx`
- `src/pages/Bets.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/bets/BetCard.tsx`
- `src/index.css`
- `HANDOFF.md`

## ✅ Sessão 2026-07-07 (3) — Correções mobile do Dashboard

Teste mobile real (viewport 338px) revelou 3 problemas corrigidos + 1 documentado.

### 🔴 Fix: KPIs primários clipados (StatCard.tsx + Dashboard.tsx)
- `text-3xl` → `text-2xl md:text-3xl` no branch `size === "lg"` do StatCard para evitar estouro em mobile.
- `min-w-0` adicionado aos grids de KPIs (primário e secundário) para permitir encolhimento.

### 🟡 Fix: Concordância da sequência (Dashboard.tsx)
- Plural condicional: "1 perdidas" → "1 perdida", "2 perdidas", "1 ganha", "2 ganhas".

### 🟡 Fix: Rótulos pulados no eixo X de "Status das apostas" (Dashboard.tsx)
- `interval={0}` + `fontSize={10}` + `tickFormatter` abrevia "Meio Ganha" → "Meio G." e "Meio Perdida" → "Meio P.".

### 🟢 Tooltip persistente após toque (não corrigido)
- Problema conhecido do recharts: tooltip fica preso após tap em touch. Soluções baratas não existem (exigiriam state management customizado ou mutação do DOM). Registrado como dívida.
- Analytics.tsx não foi inspecionado (escopo do prompt era só Dashboard).

### Verificação
`tsc --noEmit`, `vitest run` (109/109) OK.

### Arquivos alterados
- `src/components/StatCard.tsx`
- `src/pages/Dashboard.tsx`
- `HANDOFF.md`

## ✅ Sessão 2026-07-07 (2) — Refactor UX da página Configurações (Settings.tsx)

### Problema central resolvido: perda de dados por falsa sensação de persistência

Cards de Casas de Aposta e Tipsters mostravam chips imediatamente ao adicionar, mas só persistiam no "Salvar". O tema também alternava visualmente no DOM mas não salvava. Solução: sticky bar de salvamento com dirty-state tracking.

### O que foi feito (4 tarefas do PROMPT-SETTINGS-UX.md)

**1. Dirty-state + barra de salvamento sticky**
- Extraída função `profileToForm(profile)` como fonte única para hidratação do form e comparação de baseline.
- `isDirty` via `JSON.stringify` dos objetos normalizados (arrays ordenados garantem consistência).
- Barra `sticky bottom-0` com fundo `bg-card/95 backdrop-blur-sm`, visível apenas quando `isDirty` e component ready.
- Botão "Salvar" submete o form sem submit HTML; "Descartar" restaura o baseline e re-aplica a classe de tema no DOM.
- `beforeunload` listener ativo enquanto `isDirty`.
- Animação fade+slide (8px) via framer-motion, reusando tokens `DUR.reveal`/`EASE.out`/`RISE` de `motion.ts`.

**2. Layout em 2 colunas agrupado por domínio**
- Container `max-w-2xl` → `max-w-5xl`.
- Grid `lg:grid-cols-2 gap-4 items-start` com duas stacks explícitas.
- **Coluna A**: Perfil, Configurações das Apostas, Segurança.
- **Coluna B**: Casas de Aposta, Tipsters, Telegram, Aparência.
- `<form>` principal removido (save via `onClick` no botão da sticky bar). `<form>` de Segurança mantido para password managers.
- Emobile (< lg) as colunas empilham na ordem A→B.

**3. Telegram: badge sem emoji + confirmação no Desvincular**
- `Conectado ✅` → dot verde (`bg-success`) + `text-success font-medium` sem emoji.
- "Desvincular" envolto em `AlertDialog` (componente já existente no bundle) com título "Desvincular Telegram?" e descrição explicativa.

**4. Ajustes menores**
- Prefixo de moeda (`R$`/`US$`/`€`) como span absoluto à esquerda com `pl-9` no Input nos campos "Banca inicial" e "Valor da unidade".
- Removido `({form.currency})` do label "Valor da unidade" (redundante com prefixo).
- `--input` no dark: luminosidade subiu de 17% → 24% (~7pp, dentro da faixa recomendada).

### Verificação
`tsc --noEmit`, `vitest run` (109/109) e `vite build` OK via fluxo off-mount.

### Arquivos alterados
- `src/pages/Settings.tsx`
- `src/index.css`
- `HANDOFF.md`

## ✅ Sessão 2026-07-07 — Bot Telegram: fix de posse no callback + kill-switch /pausar (deployado, aguardando commit)

Contexto: o bot Telegram (edge function `telegram-webhook`, migration `20260706120000_telegram_bot.sql`, detalhes em `PROMPT-TELEGRAM-BOT.md`) foi criado em 06/07 e não estava registrado neste handoff. Fluxo: foto/texto → Gemini (cadeia de providers em `providers.ts`) → resumo + botões Confirmar/Corrigir/Cancelar → RPC `create_bet_from_telegram`. Auth do webhook via `X-Telegram-Bot-Api-Secret-Token`. Gate de uso: `resolveUser(chatId)` exige vínculo em `telegram_links` (via `/vincular CODIGO` gerado no app) antes de qualquer chamada ao Gemini — funciona como allowlist estrutural.

### Fix: callback query sem verificação de posse
`handleCallbackQuery` buscava o pending só por `id` — um chat vinculado que conhecesse o UUID de um pending alheio podia confirmá-lo/alterá-lo/cancelá-lo. Agora a busca filtra `id` + `chat_id` uma única vez no topo, cobrindo os 3 branches (c/e/x).

### Feature: kill-switch `/pausar` e `/retomar`
- Tabela `telegram_settings` (key/value JSONB, service_role only) — migration `20260707120000_telegram_settings.sql`.
- Comandos restritos a chat vinculado; flag `extraction_paused`.
- Early return no `serve()` antes de qualquer caminho que chame o Gemini (foto, texto livre e correção). Uso: quando a chave Gemini falhar ou custo explodir, `/pausar` corta tudo sem redeploy.

### Hardening: grants alinhados à intenção
Default privileges do schema haviam concedido ALL a `anon`/`authenticated` em `telegram_links` e `telegram_pending_bets` (RLS já negava acesso efetivo — teste #9 passou por isso, não pelos grants). Migration `20260707120100_telegram_tables_tighten_grants.sql`: REVOKE ALL + re-grant só de SELECT/INSERT/UPDATE em `telegram_links` para `authenticated`. Verificado no banco: grants agora exatamente como declarado.

### Deploy & verificação
- Migrations aplicadas no remoto via MCP e salvas no repo.
- Edge function redesployada (versão 8, ACTIVE, `verify_jwt=false` — auth é o secret token).
- ✅ **Verificação manual resolvida na sessão Settings UX**: 401 confirmado via curl do Windows; `/pausar` → foto recusada → `/retomar` volta a funcionar.
- Working tree: `index.ts` do webhook + 2 migrations novas + HANDOFF.md aguardando commit (pelo Windows, conforme regra FUSE).

### Dívida registrada (bot)
- Testes do bot (#1–#10 da sessão 06/07) são manuais/one-shot; converter #8 (401) e #9 (grants) em script curl/SQL se o bot evoluir.
- `getPendingBet()` em `index.ts` está morta (nunca chamada) — remover no próximo toque no arquivo.

## ✅ Sessão 2026-07-04 (2) — Limpeza de UI morta + remoção de exports não usados (working tree sujo, aguardando commit)

### #24 Limpeza de componentes UI mortos — 28 arquivos removidos
Auditoria completa de imports dos 47 componentes shadcn/ui. Removidos:
- **24 componentes sem import em nenhuma página viva**: accordion, alert, aspect-ratio, avatar, breadcrumb, calendar, card, carousel, chart, checkbox, collapsible, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, pagination, progress, radio-group, resizable, scroll-area, slider
- **Sistema de toast legado** (`@radix-ui/react-toast`): `toast.tsx`, `toaster.tsx`, `components/ui/use-toast.ts`, `hooks/use-toast.ts` — app já usa `sonner.tsx` (Toaster do shadcn/ui moderno)

### #29 Removidas funções exportadas não utilizadas de `format.ts`
- **`formatOdds()`** — nunca importada (substituída por `formatNumber` nos callers)
- **`signClass()`** — nunca importada

### #30 Corrigido `formatPercent` template literal bug
`${v >= 0 ? "" : ""}` era no-op (sempre string vazia). Removido.

### #27 Verificado: já resolvido em sessão anterior
Nenhum vestígio de `fadeInRight`/`fadeInUpItem` no código atual.

Verificação: tsc OK, vitest 109/109 OK, vite build OK (3036 modules, 4.14s).

## ➡️ PRÓXIMA TAREFA: a definir (ver backlog consolidado abaixo)
Candidatos: #25 conflito de fontes Inter vs Plus Jakarta Sans, #26 extrair constantes/animações duplicadas, ##backlog-exploracao restante.

## ✅ Sessão 2026-07-04 (1) — KPIs clicáveis + micro-interações + backlog (COMMITADO)
3 commits em `origin/main`:
- **`851e7e8`** ("feat: KPIs clicáveis com drill-down e micro-interações"):
  - `framer-motion` instalado
  - `analyticsUrl.ts`: novos params `dateRange`, `view`, `minStake`
  - `Analytics.tsx`: parse de `dateRange` (resolve para start/end) + `minStake` no filtro
  - `Dashboard.tsx`: URLs atualizadas (Lucro→dateRange, ROI→dateRange, Taxa de acerto→view=winrate, Stake média→minStake); staggered fade-in nos grids de KPI
  - `StatCard.tsx`: hover (scale-102, shadow-xl, ring-2 primary/30), active (scale-95)
- **`6d48e44`** ("fix: padroniza altura cards, animacoes em Bets, filtro periodo graficos"):
  - `StatCard.tsx`: `h-full` no Link + card (altura consistente)
  - `Dashboard.tsx`: `chartDays` state com presets 30d/90d/Tudo nos gráficos
  - `Bets.tsx`: staggered animation nos BetCards
- **`930686e`** ("feat: animacoes bets, filtro periodo graficos, altura cards") — merge anterior.
- **`2edbf6d`** ("fix: diferencia cor de Anulada (warning/amber) de Pendente; ajusta espacamento BetCard"):
  - `BetCard.tsx`: `py-3`→`py-4`, `gap-2`→`gap-3`, `h-full`
  - `calc.ts` + `BetCard.tsx`: `void` → `warning` (amarelo/âmbar), se diferencia de `pendente`

Verificação: tsc OK, vitest 109/109 OK, vite build OK.

## ✅ Insights automáticos — FEITO E COMMITADO (2026-07-03)
- **Commit `fe7dc97`** ("feat: insights automaticos no Dashboard (7 regras puras + 24 testes)"), já em `origin/main`.
- ... (restante permanece igual)

---
Histórico da sessão anterior (2026-07-01):

## ✅ RESOLVIDO nesta sessão

### #16 Filtros de Apostas
COMMITADO E PUSHADO. Commit `6f1e09f` em `origin/main`. Feature em produção, não mexer.

### Autocomplete — economia de quota + confronto "Time x Time" (2026-07-01, sessão 2)
Reporte do usuário: quota esgotando rápido e "Estados Unidos x Bósnia" sem resultado. Causas e fixes:
1. **Cache agora é pela query efetiva** (pós-tradução PT→EN + oponente): antes era pelo texto digitado, então cada tecla refazia a mesma busca "United States". Vazios bem-sucedidos também entram no cache (flag `hadError` distingue vazio legítimo de rate-limit — só o legítimo é cacheado).
2. **Parsing de confronto**: `splitMatchup()` divide em " x "/" vs ", busca pelo time A (traduzido) e filtra resultados pelo time B (variantes PT+EN, sem acentos). Placeholder atualizado ("Ex: Uruguai ou Brasil x Argentina").
3. **Corte de consumo**: debounce 320→500ms, mínimo 2→3 chars, fallback API-Sports de 2→1 time (5→3 requests por disparo).
### Mobile — 2 fixes (reporte do usuário com screenshot, aguardando commit)
1. **Cards vazando da tela**: grid dos cards sem `grid-cols-1` explícito → coluna implícita do CSS Grid usa piso min-content, e as linhas `truncate` (que incluem `nowrap`) estouravam a largura. Fix: `grid-cols-1` (Tailwind = `minmax(0,1fr)`). `Bets.tsx`.
2. **Drawer não fechava ao navegar**: sidebar mobile é um Sheet; adicionado `setOpenMobile(false)` (hook `useSidebar`) no onClick dos NavLinks. `AppSidebar.tsx`.

Pendência conhecida: colisão PT→EN pega o primeiro nome do mapa ("Estados Unidos"→"United States"; se a API indexar como "USA", pode falhar — se ocorrer, tentar variante alternativa quando a primeira vier vazia).

### #A Autocomplete de eventos — API-Sports fallback
- **Causa raiz**: TheSportsDB (key `3`, free tier) não indexa tênis e tem cobertura limitada. A key `3` funciona identicamente à `123` (doc desatualizada). Rate limit: 30 req/min.
- **Solução implementada**: criado `src/lib/apisports.ts` (API-Sports football v3) como fallback. Fluxo: TheSportsDB → se vazio → API-Sports → se vazio → "Nenhum evento encontrado." no popover.
- **Otimizações**: reduzido team hits de 3→1 no TheSportsDB (economiza requests); cache só guarda resultados não-vazios (evita cachear falhas de rate limit).
- **Env var**: `VITE_API_SPORTS_KEY` no `.env` (local) e precisa configurar no Vercel.
- **Limitação**: tênis não está em nenhuma das duas APIs. O campo funciona como texto livre quando não há resultado.
- **Expansão futura**: API-Sports tem 12 esportes (basketball, MMA, hockey, volleyball, etc.) com 100 req/dia cada. Rotear pelo sport selecionado no form está planejado mas não implementado.

### Resumo do header de filtros removido
- Removido o bloco "X apostas · Stake R$ · Lucro R$" do header da página Apostas (poluía o header de filtros). Memo `totals` também removido.

### 5ª manifestação da corrupção da ponte FUSE
- Sandbox novo (12 min uptime). Checagem de sanidade (ls/stat/find sobre `.git/index.lock`) veio **consistente** — todas concordaram que o lock existia (0 bytes, órfão).
- Usuário removeu manualmente pelo Windows.
- Na tentativa de commit: `ls` disse "No such file or directory" e `git add` disse "File exists" **na mesma shell, em sequência**. Saída contraditória clássica.
- **Ação tomada**: instruções de commit manual fornecidas ao usuário. Commit e push feitos pelo terminal do Windows.

### Autocomplete: busca em português (2026-07-01, aguardando commit)
- `translateQueryToEnglish()` em `translate.ts`: índice reverso PT→EN do mapa `TEAMS`, insensível a acentos/caixa; match exato sempre, prefixo (≥3 chars) só quando não-ambíguo.
- `sportsdb.ts` traduz a query uma vez (`searchQ`) e usa nas duas buscas do TheSportsDB e no fallback API-Sports. Cache continua chaveado pela query original.
- Limitação: cobre só o dicionário `TEAMS` (seleções). Clubes com nome igual em PT/EN já funcionavam; exônimos de clubes não mapeados continuam exigindo inglês.
- Testes: `translate.test.ts` (9 casos).

## Stack & infra
- Vite + React 18 + TypeScript + shadcn/ui + TanStack Query + Supabase + React Router.
- Repo GitHub: `MaverickDTX/minha-banca-de-apostas`. Deploy: Vercel. URL: `minha-banca-de-apostas.vercel.app`. Marca: "Bankroll Pro".
- Supabase project: `cttdibubqgrpkdzhojtn` (sa-east-1).
- APIs externas: TheSportsDB (key `3`, free, sem cadastro) + API-Sports (key em env var, free tier 100 req/dia/esporte).

## Regra de colaboração (LEIA SEMPRE)
Se uma ação for trivial para o usuário fazer manualmente fora do sandbox (ex.: apagar um arquivo, rodar git), **peça para o usuário fazer** em vez de gastar tokens tentando contornar.

## ⚠️ AMBIENTE: corrupção da ponte FUSE
A ponte sandbox↔disco do Cowork (mount FUSE via `/proc/self/fd/3`) tem bug confirmado em 6 manifestações ao longo de 4 sessões. Sintomas: leituras truncadas, stat-cache mentiroso, `ls` contraditório, locks órfãos irremovíveis (`Operation not permitted`), `git status` reportando "clean" de forma falsa.

### 6ª manifestação (2026-07-01)
Arquivos recém-editados via Edit ficaram corrompidos **na visão da montagem** (disco real intacto, confirmado via Read): `Bets.tsx` truncado no byte 27759 (meio da linha 537) de forma *consistente* (mesmo sha256 em leituras repetidas); `useBets.ts` com padding de espaços após o EOF real. Consequência: **`cp` da montagem para /tmp não é confiável para arquivos modificados na sessão.** Workaround adotado: reconstruir off-mount via `git archive HEAD` + reaplicar os patches com python (determinístico). Também confirmado: **processos em background não sobrevivem entre chamadas de bash** — verificação sempre síncrona.

### Fluxo seguro
1. **Escrita via Edit/Write é confiável** — grava direto no disco real.
2. **NUNCA confie em `git status`/`git diff`/`tsc` lidos da montagem.** Podem ler fantasma.
3. **Verificação canônica** (off-mount):
   ```
   rm -rf /tmp/verify && mkdir -p /tmp/verify
   git archive HEAD | tar -x -C /tmp/verify
   ln -s "$(pwd)/node_modules" /tmp/verify/node_modules
   cd /tmp/verify && npx tsc --noEmit && npx vite build
   ```
4. **Commits**: se `git add` falhar por lock órfão, pedir ao usuário para commitar pelo Windows.
5. Hipótese OneDrive **descartada** (pasta não está em nuvem). Causa: bug na ponte FUSE do Cowork.

## Estado do código (2026-07-04 — pós limpeza)
- `origin/main` HEAD em `2edbf6d` ("fix: diferencia cor Anulada (warning/amber) de Pendente; ajusta espacamento BetCard"). 0 ahead/0 behind, working tree sujo (HANDOFF.md + 28 arquivos removidos + format.ts editado).
- Commits recentes: `2edbf6d` (cor Anulada) ← `930686e` (merge animações) ← `6d48e44` (altura cards + filtro período) ← `851e7e8` (KPIs clicáveis) ← `598cb16` (docs) ← `fe7dc97` (insights).
- `framer-motion` instalado como dependência.
- **Vercel**: `VITE_API_SPORTS_KEY` já configurada em Environment Variables (sessão anterior).
- **Componentes shadcn/ui**: 22 sobreviventes (de 47 originais). Removidos 24 sem uso + 4 do sistema de toast legado. Bundle inicial não medido mas ~80-100KB recuperados em árvore morta.

## Pendências (tarefas) — em ordem de impacto
(Consolidado em 2026-07-04. Inclui backlog exploratório completo.)

### 🔍 BACKLOG EXPLORAÇÃO (2026-07-04) — novos achados
Itens mapeados durante exploração do codebase para a próxima sessão:

**#26 Extrair constantes duplicadas** — `DAY_NAMES` declarado em 3 arquivos (`src/lib/calc.ts`, `src/lib/insights.ts`, `src/pages/Dashboard.tsx`); `CHART_RANGES`/`PRESETS`/`QUICK_RANGES` replicados em `Dashboard.tsx` e `Analytics.tsx`. Ação: consolidar em `src/lib/constants.ts`.

**#32 Tipos não utilizados** — `src/integrations/supabase/types.ts` possui tipos gerados automáticos; alguns podem ser removidos. Ação: revisar.

**#33 Estilo de código: imports não utilizados** — linhas de `import type` e imports de React não utilizados espalhados. Ação: configurar lint rule `unused-imports`.

**#34 Arquivos de documentação antigos** — `UIUX_REVIEW.md` mencionado como não versionado; verificar se `src/App.css` existe ou foi substituído por Tailwind. Ação: auditar.

**#35 Configuração de tema claro inconsistente** — Tema claro usa hue antigo (não 262). Ação: harmonizar ou documentar decisão.

### ✅ #25 Conflito de fontes — Plus Jakarta Sans unificado (FEITO 2026-07-04, COMMITADO)
- `@import url('...Inter...')` removido do `index.css` (Inter carregava +15KB de fonte nunca usada)
- `html { font-family: 'Inter' }` → `"Plus Jakarta Sans"`
- `tailwind.config.ts`: `fontFamily.sans` e `mono` agora apontam para PJS, não Inter
- CSS redundante do `body` e `.font-mono` removido (herdam do `html`)
- Efeito: zero flash de fonte (1 única família carregada), ~15KB a menos de CSS/network

### ✅ #24 Limpeza de componentes UI mortos (FEITO 2026-07-04, COMMITADO)
24 componentes shadcn/ui sem import removidos + sistema de toast legado (`toast.tsx`, `toaster.tsx`, `use-toast.ts`) que já havia sido substituído por `sonner.tsx`.

### ✅ #27 Animações não utilizadas (FEITO 2026-07-04, já limpas em sessão anterior)
Nenhum vestígio de `fadeInRight`/`fadeInUpItem` no código. As variantes `stagger` e `fadeUp` em Dashboard.tsx e Bets.tsx são todas usadas.

### ✅ #28 Toast: sonner é o ativo (FEITO 2026-07-04, aguardando commit)
`sonner.tsx` é importado em `App.tsx` e usado como `<Sonner>`. Sistema legado (`toast.tsx`, `toaster.tsx`, `use-toast.ts` em ambos os locais) removido. `react-hot-toast` não é mais importado por nenhum arquivo (pode ser removido do `package.json`).

### ✅ #29 Funções não usadas removidas (FEITO 2026-07-04, aguardando commit)
`formatOdds()` e `signClass()` removidos de `src/lib/format.ts`.

### ✅ #30 `formatPercent` corrigido (FEITO 2026-07-04, aguardando commit)
Template literal no-op `${v >= 0 ? "" : ""}` removido.

### ✅ #31 Componentes confirmados e removidos (FEITO 2026-07-04, aguardando commit)
`pagination.tsx` (não usado — app tem `BetsPagination` próprio), `popover.tsx` (confirmado: usado sim, via `Command`). Ambos corretamente tratados — popover mantido, pagination removido.

### ✅ P0 — integridade de dados (FEITO 2026-07-01, aguardando commit)
- **#19 RESOLVIDO**: 4 RPCs transacionais criadas (`replace_bet_legs`, `update_bet_with_legs`, `bulk_settle_bets`, `create_bets_with_legs`), todas SECURITY INVOKER + revalidação de posse via `auth.uid()`. Migration `20260701150000_atomic_bet_write_rpcs.sql` (aplicada no remoto via MCP e salva no repo). `useBets.ts` migrado para `rpc()`; smoke test no banco confirmou atomicidade (rollback de lote com id inválido). **Bônus**: corrigido bug de freebet no `handleBulkStatus` (Bets.tsx) — não passava `is_free_bet`, liquidação em lote de freebet perdida calculava `-stake` em vez de 0. **#21 também resolvido**: `useDeleteBet` filtra `user_id`; `useUpdateBet` valida posse na RPC.

### ✅ P1 — correções rápidas (FEITO 2026-07-01, aguardando commit)
- **#20 RESOLVIDO** (`calc.ts`/`metrics.ts` + 5 testes novos, 76 no total):
  - Hit rate: cashout classifica pelo sinal do `net_profit` (lucro = win, prejuízo = loss, break-even/null = skip). Hit rate histórico exibido cai — é correção de viés, usuário ciente.
  - Kelly: `kellyStake` com clamp em ≥ 0. `kelly_fraction` (Kelly cru) segue podendo ser negativo — informativo. Valores já persistidos em `bets` não mudam retroativamente.
  - Drawdown/streak: ordenação desempata por `created_at`.
  - `avgClv`/`avgEv`: mantida média simples por aposta, agora documentada como decisão (mede habilidade por decisão, não retorno por capital).
- ~~**#21 Defense-in-depth**~~ ✅ resolvido junto com #19 (ver P0).
- **Bug do cashout na edição RESOLVIDO** (reportado pelo usuário): o BetForm tem duas abas, cada uma com seu Select de status; o campo "Retorno do cashout" só existia na aba avançado. Adicionado também na aba principal. De carona: `setStatusQuick` (menu ⋯ da tabela de Apostas) tinha o mesmo bug de freebet do bulk — corrigido.
- **Nota UX (para #23)**: múltiplas não têm como registrar cashout — o status é derivado das pernas (`LegStatus` não tem cashout). Se cashout de múltipla for caso real de uso, precisa de decisão de design (ex.: flag de cashout no nível da aposta sobrepondo o status derivado).

### ✅ P2 — performance (FEITO 2026-07-02, aguardando commit)
- **#22 RESOLVIDO**: `React.lazy` nas 10 páginas + `Suspense` com spinner (`PageFallback` em App.tsx) + `manualChunks` (recharts 548 kB e supabase 213 kB em chunks próprios, cache estável). Bundle inicial: 1.240 kB → **224 kB** (-82%); páginas viram chunks de 1–57 kB carregados sob demanda. recharts só baixa quando uma página com gráfico abre.

### ✅ Eixo de datas sobreposto — RESOLVIDO (aguardando commit)
Removido `scale="time"` (era ele que fazia o recharts emitir um tick por ponto) e adicionado `minTickGap={48}` nos XAxis numéricos de `Dashboard.tsx` (Evolução da banca) e `Analytics.tsx` (Lucro acumulado & drawdown). Eixo linear de timestamps é equivalente para exibição; os ticks agora respeitam espaçamento mínimo. **Validar visualmente após deploy** — se os rótulos caírem em horários "quebrados", a alternativa é gerar `ticks` explícitos (1º dia de cada mês).

### P3 — features
- **#A expansão multi-esporte**: rotear API-Sports fallback pelo sport selecionado (basketball, MMA, etc.). **Decidir antes**: `VITE_API_SPORTS_KEY` vai ao bundle (qualquer visitante extrai e queima as 100 req/dia); se o app for além de uso pessoal, mover p/ Supabase Edge Function como proxy — e aí implementar #A já do lado do servidor.
- ~~**#14 Logo/identidade**~~ ✅ FEITO (2026-07-02, aguardando commit): ícone CircleDollarSign (cofre/moeda, escolha do usuário) no verde primary — `AppSidebar.tsx` + `Auth.tsx`; favicon SVG novo em `public/favicon.svg` (moeda-$ verde sobre fundo escuro arredondado) com fallback `.ico` no `index.html`. Sugestão futura: apagar o `favicon.ico` antigo e gerar apple-touch-icon.
- **#15 Segurança nas Configurações**: ✅ **#15a trocar senha FEITO** (2026-07-01) — card "Segurança" em Settings.tsx, form separado do form de perfil, mínimo 8 chars. **Atenção**: o projeto Supabase tem "Require current password when changing password" habilitado, então o `updateUser` recebe `current_password` além de `password` (campo "Senha atual" na UI; sem ele o Auth rejeita). **#15b apagar conta PENDENTE** — exige Edge Function com service role (`auth.admin.deleteUser`) + confirmação forte na UI; não fazer client-side.
- ~~**#18 Recortes de tempo**~~ ✅ FEITO (2026-07-01, aguardando commit): pills 7d/14d/30d/90d/Tudo no filtro das Análises; editar data manualmente desmarca o preset.
- ~~**Tradução de esportes**~~ ✅ FEITO: `mapSportLabel` reescrito como mapa com ~30 esportes (nota: "american football" agora → "Futebol Americano", antes "NFL"); dados legados migrados no banco via SQL (3 rows: Mixed Martial Arts→MMA, Motor Sport→Automobilismo, Water Polo→Polo Aquático).
- **#17 Dashboard personalizável** (KPIs/cards). Baixa prioridade.
- **#23 — P1 do relatório RESOLVIDOS** (2026-07-01, aguardando commit): lucro "—" p/ pendentes (BetCard + tabela); "Retorno/Lucro potencial" = "—" sem odd válida (BetForm); eixo temporal numérico (timestamp + scale="time") em Evolução da banca (Dashboard e Bankroll) e no Lucro acumulado & drawdown (Analytics, antes índices crus); meses zero-fill no Resultado por mês; histograma de odds em ordem fixa das faixas; CLV/EV médio = "—" sem dados (novos campos clvCount/evCount em Metrics); barra fantasma corrigida (sport string vazia → "Outro"/"—", `||` em vez de `??` nos agrupadores); YAxis do Lucro por esporte alargado (95px). P2 restantes: tooltip do recharts preso após tap em touch (conhecido, ver sessão 2026-07-07 (3)). ~~Copy~~ ✅ (2026-07-02): tabela de múltiplas agora diz "Múltipla · pernas em Editar"; sidebar/página "Bankroll" → "Banca" (URL /bankroll mantida). Fontes 9-11px/contraste ainda em aberto.
- **Gráfico duplicado RESOLVIDO** (decisão do usuário): Bankroll trocou "Evolução da banca" (ficou só no Dashboard) por **"Composição da banca"** — cascata inicial → depósitos/bônus/ajustes/saques/lucro → atual (waterfall via barras empilhadas com base transparente + `tooltipType="none"`).
- **Tooltips dos gráficos RESOLVIDO** (reporte do usuário com screenshot): texto do tooltip ilegível no dark mode (cor default do recharts) e nomes de série em inglês ("profit"). Todos os Tooltips ganharam `labelStyle`/`itemStyle` com `--popover-foreground`, `cursor` temático (`--muted` 40%) e as séries ganharam `name` em PT (Banca, Lucro, Apostas, Drawdown, Variação).
- **#23 Avaliação UI/UX**: ✅ **FEITA** (2026-07-01, navegação real em produção via Chrome) — relatório completo em `UIUX_REVIEW.md` na raiz (não versionado por padrão; adicionar ao .gitignore ou commitar, decisão do usuário). Achado P0: deep link/F5 dava 404 (vercel.json legado sem SPA fallback) — **corrigido no vercel.json, aguardando commit**. P1 pendentes (precisão de dados): lucro "R$ 0,00" em pendentes → "—"; eixo X com índices crus no gráfico de drawdown; eixo temporal categórico esconde gap 2023→2026; histograma de odds fora de ordem; coluna EV médio morta; lucro potencial negativo com odd vazia. P2: idioma misto (sidebar "Bankroll", esportes sem tradução), gráfico banca duplicado com cores diferentes, barra fantasma no "Lucro por esporte", selects truncados. Teste mobile real pendente (janela recusou resize; análise de código ok). Conecta com #14 e #17.
- **Adiado — Winning bonus/boost**: campo separado p/ não sujar CLV/EV.

### Dívida registrada (sem ação imediata)
- Métricas derivadas (`net_profit`, `ev`, `clv`…) persistidas em `bets`: cada mudança de fórmula exige migração de dados (ex.: backup market_swap). Alternativa (calcular na leitura) é refactor grande — só se o custo se repetir.
- `useBets` pagina tudo p/ o cliente (ok p/ uso pessoal, não escala).
- Verificação canônica deve ser **síncrona** (processos em background não sobrevivem entre chamadas de bash no sandbox).

## Fora do código (dashboard) — ✅ tudo feito em 2026-07-01
- ~~Supabase URL Configuration~~ trocada. ~~`VITE_API_SPORTS_KEY` no Vercel~~ configurada. ~~Backup `bets_backup_market_swap_20260630`~~ DROP executado via MCP.

## UI/UX — RODADA 2 CONSOLIDADA (2026-07-02; 2 avaliações heurísticas externas + feedback anterior)
Priorização por convergência entre avaliadores independentes + custo:

**✅ 1ª leva FEITA (2026-07-02, aguardando commit):** tooltips (?) em ROI/Yield/Taxa de acerto/Drawdown (prop `info` no StatCard, shadcn Tooltip); "↑/↓ R$ X vs mês anterior" no Resultado do mês (delta absoluto, não % — sinais diferentes invalidam %); `--muted-foreground` 64%→71%; pills Hoje/7d/30d/Tudo em Apostas (params start/end, data em fuso local); valores dos cards `font-medium` (Metric).

**Baratos (1ª leva — original):**
- Tooltips explicativos nos KPIs (ROI, Yield, CLV, Drawdown) — 1 linha de definição cada.
- Comparação temporal no Dashboard: "↑ +12% vs mês anterior" como hint nos cards (vs. próprio histórico; NÃO usar rótulos absolutos tipo "acima da média" — sem benchmark defensável).
- Contraste dos secundários + ajuste do muted-foreground (já registrado; as 2 avaliações confirmam).
- Filtros rápidos de data em Apostas (Hoje/Semana/Mês) — replicar padrão do #18.
- Peso dos números > rótulos nos cards (já registrado).

**✅ 2ª leva FEITA (2026-07-02, aguardando commit):** modo compacto (3ª opção no toggle de vista, persistida em localStorage `bets:view`; BetCard prop `compact` = 1 linha com odd/stake/CLV/lucro); quick actions no hover desktop (✓ Ganha / ✗ Perdida p/ simples pendente + ✎ Editar; `group-hover` + `focus-within`; menu ⋯ extraído p/ const `menu` compartilhada); CLV com seta ↑/↓ + `strong` (prop nova no Metric); badge de status maior no card cheio (11px, semibold); hierarquia de KPIs no Dashboard (4 primários `size="lg"` text-3xl em grid próprio + 8 secundários em grid 2×4; prop `size` no StatCard); skeletons de loading em Bets (6 cards) e Dashboard (4 KPIs). Pendente da lista original: ícone do esporte no card, focus states/teclado.

**Médios (2ª leva — original):**
- Modo compacto na lista de apostas (densidade p/ usuário intensivo; toggle Compacto/Completo).
- Quick actions no hover do card (Liquidar/Editar expostos; ⋯ continua p/ o resto). NÃO fazer card inteiro clicável (conflita com expander de múltipla).
- Destaque do CLV (métrica-assinatura do produto — badge/posição/seta).
- Hierarquia entre KPIs do Dashboard: primários (Banca, Lucro, ROI, Yield) maiores que secundários (Stake média, Odd média...).
- Badges de status maiores/mais fortes (SEM emoji — conflita com identidade).
- Skeletons de loading (pós code-splitting) + microinterações de hover.
- Focus states/navegação por teclado (a11y).
- Ícone do esporte no card (diferenciação visual entre cards).

**Grande (destaque do backlog):**
- Insights automáticos: groupBy+computeMetrics já calculam tudo — é renderizar conclusões ("mercado X é seu mais lucrativo", "sequência de 3 reds", "Yield caiu 2,4% em 30d"). KPIs clicáveis com drill-down p/ Análises filtradas entram aqui.

**Decisões do usuário pendentes:**
- Contradição entre avaliações: evento maior + card enxuto (aval. 1) vs títulos menores (aval. 2) — decidir usando o app.
- Ícones dos KPIs: aval. 1 sugeriu remover; usuário pediu explicitamente — manter salvo mudança de opinião.

**Futuro distante (ideias registradas):** heatmaps por esporte/casa, projeção de banca, metas/objetivos, comparativo de estratégias, alertas de risco (drawdown/exposição), modo trader tempo real, dashboard arrastável (#17).

## UI/UX — sugestões anteriores (2026-07-02, feedback externo trazido pelo usuário)
Sobre a tela de listagem de apostas, no tema roxo + Jakarta:
1. **Hierarquia de texto**: metadados ("Futebol · Swedish Allsvenskan...") e rótulos ("ODD", "STAKE") em roxo-acinzentado lavado (ref. sugerida `#8F8AA6` ≈ ajustar `--muted-foreground`) p/ título do evento e números saltarem.
2. **Verde da CLV**: em fundo roxo escuro, testar verde mais saturado/menta (ex.: subir S/L do `--success`) p/ o positivo brilhar sem cansar.
3. **Peso dos números**: valores (odd, stake, CLV) um passo mais grossos (medium/semibold) que os rótulos acima deles — absorção instantânea. Hoje BetCard usa mesmo peso.
4. Próximos alvos sugeridos na tela de listagem (escolher na hora): design dos filtros/busca do topo; visual das tags de status (PENDENTE etc.); comportamento visual do card quando ganha/perde (lucro líquido).
(Obs.: tabular-nums já aplicado globalmente em .font-mono/.stat-value — item equivalente da lista original descartado.)

## Identidade visual — iteração 3 FINAL (2026-07-02, aguardando commit)
Usuário escolheu via prévia interativa: **tema roxo profundo** (hue 262 nos tokens dark; verde continua exclusivo de resultados/CTAs) + **Plus Jakarta Sans no app inteiro** (corpo, títulos e números com `tabular-nums`; substituiu Space Grotesk + IBM Plex — a Jakarta não é mono, dígitos alinham via tnum). Arquivos: `src/index.css`, `index.html`. Tema claro segue intocado (hue antigo) — harmonizar se o usuário usar light mode.

## Identidade visual — iteração 2 (2026-07-02, aguardando commit)
Feedback na 1ª passada: verde "militar" (saturação alta), JetBrains Mono não agradou, Space Grotesk imperceptível (só 3 headings pequenos). Ajustes aplicados: saturação dos tokens dark cortada (~18%→~6-8%, carvão quase neutro com sopro de verde) e mono trocada p/ IBM Plex Mono (`index.css` + `index.html`). **Em aberto**: (a) usuário ainda avaliando a cor — se não amar, testar neutro puro ou outro hue; (b) display precisa de aplicação mais visível (marca/KPIs) ou outra fonte (Sora, Archivo, Clash Display); (c) 7ª manifestação FUSE: index.css truncado na visão da montagem logo após Edit, disco íntegro via Read.

## Arquivos centrais
- Autocomplete eventos: `src/lib/sportsdb.ts`, `src/lib/apisports.ts`, `src/components/bets/EventAutocomplete.tsx`.
- Form/apostas: `src/components/bets/BetForm.tsx`, `LegsEditor.tsx`, `TipsterAutocomplete.tsx`, `MarketAutocomplete.tsx`, `SelectionAutocomplete.tsx`, `BetsPagination.tsx`, `src/components/bookmakers/BookmakerSelect.tsx`.
- Cálculo/métricas: `src/lib/calc.ts`, `metrics.ts`, `marketSuggestions.ts`.
- Páginas: `src/pages/Bets.tsx`, `NewBet.tsx`, `Settings.tsx`, `Dashboard.tsx`, `Analytics.tsx`, `Bankroll.tsx`.
- Dados: `src/hooks/useProfile.ts`, `useBets.ts`, `src/integrations/supabase/types.ts`.
- Tradução: `src/lib/translate.ts`.
