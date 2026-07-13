# Handoff — Bankroll Pro (minha-banca-de-apostas)

Última atualização: 2026-07-13

Planilha web para controle de apostas esportivas: registro de apostas, gestão de
banca e análise de desempenho (ROI, yield, taxa de acerto, drawdown, CLV, EV, Kelly).

## Estado atual

- `origin/main`: `c9202e5`. Local `main` à frente por 3 commits (docs handoff +
  fix MMA fighterFallback + fix busca "A x B"). **Push pendente pelo Windows**
  (sandbox sem credencial git).
- Verificação da sessão 2026-07-13: `tsc --noEmit` 0 erros, `vitest` 119/119 OK.
- Autocomplete MMA: agora busca em cascata **TheSportsDB → Odds API → API-Sports MMA** quando o primário falha. Todos os caches armazenam resultados vazios (evita re-fetch infinito).
- MMA como fonte secundária universal: aparece nos resultados independente do esporte selecionado (como F1 e Tênis já faziam). **Fix 2026-07-13:** a fonte secundária agora passa `fighterFallback: false` — só usa os caches TSDB+Odds. Antes, qualquer query de outro esporte que não coincidisse com luta caía no terciário e disparava `/fighters?search=<time de futebol>` na API-Sports (quota + latência à toa).
- **Fix 2026-07-13 (busca "A x B"):** a key gratuita do TheSportsDB trunca `eventsnext.php` a **1 evento** (verificado ao vivo), então buscar só a agenda do lado A perdia confrontos (caso real: "Halmstad x BK Hacken" — o next do Halmstad ainda era o jogo de hoje já encerrado; o confronto só aparecia no next do Häcken). Agora: (1) busca a agenda dos dois lados; (2) filtro exige ambos os lados, casando por tokens ≥3 chars ("BK Hacken" casa com "Halmstad vs Häcken" via token "hacken"; frase inteira falhava); (3) retry com o token mais longo quando o filtro zera (`searchteams.php?t=BK Hacken` devolve só o time feminino; `t=Hacken` acha o masculino).

## Backlog vivo

Não há tarefa de código pendente confirmada. Os itens abaixo são bloqueios de
plano ou decisões conscientes de adiamento — nenhum é bug em aberto.

1. **Leaked Password Protection (Supabase)** — BLOQUEADO POR PLANO. Advisor
   `auth_leaked_password_protection` (WARN) fica aberto. O toggle é feature Pro
   do Supabase; decisão do usuário (2026-07-10): **não fazer agora**. Reavaliar se
   houver upgrade de plano.

2. **#8 — teste automatizado do 401 do webhook Telegram** — DIFERIDO. Exigiria
   refatorar o handler Deno (`telegram-webhook`) para ser importável no vitest
   (extrair `handleRequest` pura). O comportamento 401 já existe e é trivial
   (`if (secret !== WEBHOOK_SECRET) return 401`). Não justifica a refatoração agora.

3. **#15b — excluir conta (LGPD art. 18)** — DIFERIDO até abrir para outros
   usuários. Exige Edge Function com service role (`auth.admin.deleteUser`) +
   confirmação forte na UI; não fazer client-side. Enquanto single-user, exclusão
   = SQL direto no Supabase. #15a (trocar senha) já feito.

### Ideias registradas (sem compromisso)

- **#A — expansão multi-esporte**: rotear o fallback API-Sports pelo esporte
  selecionado. Decidir antes: `VITE_API_SPORTS_KEY` vai ao bundle (visitante pode
  extrair e queimar a cota); se o app deixar de ser pessoal, mover para uma Edge
  Function proxy e implementar #A já no servidor.
- **#17 — Dashboard personalizável** (KPIs/cards arrastáveis). Baixa prioridade.
- Futuro distante: heatmaps por esporte/casa, projeção de banca, metas/objetivos,
  comparativo de estratégias, alertas de risco (drawdown/exposição).

## ⚠️ AMBIENTE: corrupção da ponte FUSE (LEIA ANTES DE EDITAR)

A ponte sandbox↔disco do Cowork (mount FUSE) tem bug confirmado em múltiplas
sessões. Sintomas: leituras truncadas, stat-cache mentiroso, `ls`/`git status`
contraditórios, locks órfãos irremovíveis (`Operation not permitted`).

**Regras práticas:**

1. Escrita via Edit/Write é confiável (grava no disco real). Mas edits que
   **encurtam** um arquivo podem deixar NUL de padding ou truncar o final —
   sempre conferir com `tail`/`wc -l` e rodar **eslint** (não só `tsc`) depois.
2. NUNCA confie em `git status`/`git diff`/`tsc` lidos da montagem — podem ler
   fantasma. `tsc` lê via symlink do tsconfig e não pega truncamento; eslint/SWC
   pegam.
3. **Verificação canônica off-mount:**
   ```
   rm -rf /tmp/verify && mkdir -p /tmp/verify
   git archive HEAD | tar -x -C /tmp/verify
   ln -s "$(pwd)/node_modules" /tmp/verify/node_modules
   cd /tmp/verify && npx tsc --noEmit && npx eslint . && npx vitest run
   ```
   (Sem `vite build` no sandbox — rollup win32 não roda.)
4. Commits: se `git add`/push falhar por lock órfão ou falta de credencial,
   **commitar/pushar pelo Windows**.
5. Processos em background NÃO sobrevivem entre chamadas de bash — verificação
   sempre síncrona.
6. Se um arquivo aparecer truncado na montagem mas íntegro via Read (host),
   regravar o conteúdo por heredoc (`cat > arquivo << 'EOF'`) por dentro do VM:
   o write-through refresca o cache e o disco recebe o mesmo conteúdo.

## Stack & infra

- Vite + React 18 + TypeScript + shadcn/ui + TanStack Query + Supabase + React Router.
- Repo GitHub: `MaverickDTX/minha-banca-de-apostas`. Deploy: Vercel.
  URL: `minha-banca-de-apostas.vercel.app`. Marca: "Bankroll Pro".
- Supabase project: `cttdibubqgrpkdzhojtn` (sa-east-1).
- APIs externas: TheSportsDB (key `3`, free) + API-Sports (`VITE_API_SPORTS_KEY`
  em env, free tier 100 req/dia/esporte — já configurada no Vercel).
- Login de teste: `teste@teste.com` / `teste`.

## Arquivos centrais

- Autocomplete de eventos: `src/lib/sportsdb.ts`, `apisports.ts`, `translate.ts`,
  `src/components/bets/EventAutocomplete.tsx`.
- Form/apostas: `src/components/bets/BetForm.tsx`, `LegsEditor.tsx`,
  `TipsterAutocomplete.tsx`, `MarketAutocomplete.tsx`, `SelectionAutocomplete.tsx`,
  `BetsPagination.tsx`, `BetCard.tsx`, `src/components/bookmakers/BookmakerSelect.tsx`.
- Cálculo/métricas: `src/lib/calc.ts`, `metrics.ts`, `insights.ts`,
  `marketSuggestions.ts`, `constants.ts`, `format.ts`.
- Páginas: `src/pages/Bets.tsx`, `NewBet.tsx`, `Settings.tsx`, `Dashboard.tsx`,
  `Analytics.tsx`, `Bankroll.tsx`, `Calendar.tsx`.
- Dados: `src/hooks/useProfile.ts`, `useBets.ts`, `src/integrations/supabase/types.ts`.
- Bot Telegram: `supabase/functions/telegram-webhook/index.ts` (+ `providers.ts`).
- Mobile: `src/components/mobile/MobileHome.tsx`, `MobileGate.tsx`,
  `src/lib/use-media-query.ts`.

## Regra de colaboração

Se uma ação for trivial de fazer fora do sandbox (apagar arquivo, rodar git),
peça ao usuário em vez de gastar tokens contornando o bug do FUSE.

---

## Changelog condensado

Histórico de sessões (todas verificadas com `tsc`/`eslint`/`vitest` e commitadas,
salvo indicação). Detalhe fino disponível no git log.

- **2026-07-13** — Autocomplete: (1) MMA secundário sem busca de lutador
  (`fighterFallback: false`); (2) busca "A x B" consulta agenda dos dois times,
  match por token ≥3 chars e retry com token mais longo (caso Halmstad x BK
  Hacken; key gratuita TSDB trunca eventsnext a 1 evento). `mma.ts`, `sportsdb.ts`.
- **2026-07-11** — Autocomplete MMA reescrito: `searchMmaEvents` tenta TheSportsDB → Odds API → API-Sports MMA em cascata em vez de depender só da TheSportsDB. Cache de MMA e Odds API passam a armazenar resultados vazios (elimina re-fetch infinito). MMA vira fonte secundária universal (aparece em qualquer esporte, como F1/Tênis). Sport auto-switch no `onPick` já existia. `mma.ts`, `sportsdb.ts`, `oddsApi.ts`.
- **2026-07-10** — Favicon: `favicon.ico` ainda continha o ícone antigo (só o
  `.svg` fora trocado); regenerado a partir do SVG (cifrão verde, 6 tamanhos
  16→256px) em `public/` e `dist/`, `?v=2` no `index.html` para furar cache.
- **2026-07-09 (5)** — #9 grants/RLS: migration
  `20260710012600_harden_business_tables_grants.sql` aplicada e verificada ao vivo.
  `getPendingBet()` morta removida do webhook. #8 (teste 401) diferido.
- **2026-07-09 (4)** — Fix "Julho De 2026" no calendário (removido `capitalize`).
  #26 constantes duplicadas consolidadas em `src/lib/constants.ts`. Lint: 2×
  `no-explicit-any` do webhook corrigidos com interfaces `Telegram*`; 0 erros.
- **2026-07-09 (3)** — Calendário: Dialog do dia vira mini feed (cada aposta com
  horário/evento/mercado/odd/stake/status/lucro); `formatTime` + horário no BetCard.
  Unidade "u" como moeda selecionável em todo o app (conversão só na apresentação;
  banco segue em R$). `src/lib/format.test.ts` novo.
- **2026-07-09 (2)** — Mobile: valor R$ oculto na célula do calendário abaixo de
  `sm`; `.stat-value` responsivo (`text-xl md:text-2xl`) + `min-w-0`; varredura de
  overflow a 338px em Bets/Bankroll/NewBet/Analytics (OK).
- **2026-07-09 (1)** — Tooltip recharts: dismiss por scroll/touchmove + timeout 4s
  (Dashboard + Analytics). Guard de viewport na `/inicio` (desktop → `/`). Logo
  clicável (Link responsivo).
- **2026-07-08** — MobileHome (grid 3×2 + barra "Nova aposta"), rota `/inicio`.
  Import/Export e Telegram realocados para Configurações. Refinamentos do BetCard
  (logo da casa 32px, meta, quick actions verticais, escala tipográfica).
  Confirmação ao excluir transação na Banca.
- **2026-07-07** — Bot Telegram: fix de posse no callback query (filtra `id`+`chat_id`);
  kill-switch `/pausar`/`/retomar` (`telegram_settings`); grants das tabelas telegram
  endurecidos. Refactor UX de Settings (dirty-state + sticky save bar, layout 2
  colunas). Correções mobile do Dashboard (KPIs, plural, eixo X).
- **2026-07-04** — KPIs clicáveis com drill-down + micro-interações (framer-motion).
  #24 limpeza de 28 componentes shadcn/ui mortos + toast legado. #25 fontes
  unificadas em Plus Jakarta Sans. #29/#30 limpeza em `format.ts`.
- **2026-07-03** — Insights automáticos no Dashboard (7 regras puras + 24 testes).
- **2026-07-02** — Identidade visual final (tema roxo hue 262 no dark, verde só
  para resultado/CTA; Plus Jakarta Sans no app inteiro). Code-splitting: bundle
  inicial 1.240 kB → 224 kB. Waterfall "Composição da banca" na Banca. Favicon
  SVG. Tema claro não harmonizado (usa hue antigo — só importa em light mode).
- **2026-07-01** — P0 integridade: 4 RPCs transacionais (`replace_bet_legs`,
  `update_bet_with_legs`, `bulk_settle_bets`, `create_bets_with_legs`), todas com
  revalidação de posse via `auth.uid()`. Correções de hit rate (cashout pelo sinal
  do net_profit), Kelly (clamp ≥ 0), freebet em liquidação em lote. Filtros de
  Apostas. Autocomplete PT→EN + fallback API-Sports. SPA fallback no `vercel.json`.

## Dívida técnica registrada (sem ação imediata)

- Métricas derivadas (`net_profit`, `ev`, `clv`…) são **persistidas** em `bets`:
  cada mudança de fórmula exige migração de dados. Calcular na leitura seria
  refactor grande — só se o custo se repetir.
- `useBets` pagina tudo no cliente (ok para uso pessoal, não escala).
- Tema claro usa hue antigo — harmonizar se o usuário passar a usar light mode.
- Testes do bot Telegram são manuais/one-shot (ver #8 no backlog).
