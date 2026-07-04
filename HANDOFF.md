# Handoff — Bankroll Pro (minha-banca-de-apostas)

Data: 2026-07-03 (última atualização; histórico abaixo)

## ➡️ PRÓXIMA TAREFA: a definir
Candidatos do backlog: KPIs clicáveis (drill-down p/ Análises filtradas — era o "se sobrar espaço" da sessão dos insights, e o follow-on natural), #15b apagar conta (Edge Function), #A multi-esporte (aguarda decisão da key API-Sports), #17 dashboard customizável, miúdos (ícone do esporte no card, focus states, tema claro no hue antigo).

## ✅ Insights automáticos — FEITO E COMMITADO (2026-07-03)
- **Commit `fe7dc97`** ("feat: insights automaticos no Dashboard (7 regras puras + 24 testes)"), já em `origin/main` (HEAD == origin/main, 0 ahead/0 behind). Working tree limpo (só `UIUX_REVIEW.md` untracked, intencional).
- **`src/lib/insights.ts`** (novo): 7 regras puras sobre `Bet[]` retornando `{ id, severity: "positive"|"warning"|"info", text } | null` — bestMarket, worstMarket, bestBookmaker, redStreak (≥3, alerta tilt), yieldTrend (30d vs 30d anteriores), clvBySport (melhor positivo ou pior negativo), drawdownRecent (janela 30d ≥ 80% do pior histórico). `computeInsights()` agrega e ordena por severidade (warning > positive > info).
- **Thresholds exportados e documentados**: MIN_GROUP_BETS=10, MIN_WINDOW_BETS=5, MIN_CLV_BETS=10, RED_STREAK_ALERT=3, YIELD_MIN_DELTA_PP=2, DRAWDOWN_RECENT_RATIO=0.8, WINDOW_DAYS=30. Sem rótulos absolutos — comparação só com o próprio histórico. `InsightContext.now` injetável p/ testes determinísticos.
- **`src/lib/insights.test.ts`** (novo): 24 testes (100 no total do repo, todos verdes).
- **`Dashboard.tsx`**: card "Insights" entre KPIs secundários e gráficos; até 5 insights; ícone por severidade (AlertTriangle/TrendingUp/Info, sem emoji); card some quando não há insight (dados insuficientes).
- Verificação canônica executada: tsc OK, vitest 100/100, vite build OK (bundle inicial inalterado, 224 kB).

## Estado atual (fim da sessão 2026-07-03)
- Tudo commitado e pushado até `fe7dc97` (insights automáticos). Antes: `e597314` (quick actions toolbar flutuante) e `1a1395f`. Nada pendente de commit.
- **UI/UX rodada 2 COMPLETA**: levas 1 e 2 + 4 fixes de acabamento (metadados quebrando, período vazando, lucro negativo quebrando linha, toolbar flutuante).
- Identidade final: tema roxo profundo (hue 262) + Plus Jakarta Sans global + favicon/logo CircleDollarSign.
- Performance: #22 feito (bundle 224 kB, -82%).
- Backlog restante: **KPIs clicáveis (drill-down p/ Análises — próxima natural)**, #15b apagar conta (Edge Function), #A multi-esporte (aguarda decisão do usuário sobre a key API-Sports: pessoal vs público), #17 dashboard customizável, miúdos (ícone do esporte no card, focus states, tema claro no hue antigo). ~~insights automáticos~~ ✅ FEITO (`fe7dc97`).
- FUSE: 7 manifestações documentadas. Fluxo seguro inalterado: Edit/Write confiáveis; leituras da montagem de arquivos editados na sessão NÃO confiáveis; verificação = git archive HEAD → /tmp + replay dos patches via python + tsc/vitest/build; processos em background não sobrevivem entre chamadas bash; commits sempre pelo terminal do usuário.

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

## Estado do código
- `origin/main` = último commit do usuário (API-Sports fallback + remoção do resumo).
- Commits recentes: API-Sports fallback → `6f1e09f` (#16 filtros) → `8311adf` (free bet fix) → `633c4d7` (settings boxes).
- **Vercel**: precisa configurar `VITE_API_SPORTS_KEY` em Environment Variables.

## Pendências (tarefas) — em ordem de impacto
(Consolidado em 2026-07-01 após revisão geral do codebase. #19–#22 vêm da revisão.)

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
- **#23 — P1 do relatório RESOLVIDOS** (2026-07-01, aguardando commit): lucro "—" p/ pendentes (BetCard + tabela); "Retorno/Lucro potencial" = "—" sem odd válida (BetForm); eixo temporal numérico (timestamp + scale="time") em Evolução da banca (Dashboard e Bankroll) e no Lucro acumulado & drawdown (Analytics, antes índices crus); meses zero-fill no Resultado por mês; histograma de odds em ordem fixa das faixas; CLV/EV médio = "—" sem dados (novos campos clvCount/evCount em Metrics); barra fantasma corrigida (sport string vazia → "Outro"/"—", `||` em vez de `??` nos agrupadores); YAxis do Lucro por esporte alargado (95px). P2 restantes: teste mobile real. ~~Copy~~ ✅ (2026-07-02): tabela de múltiplas agora diz "Múltipla · pernas em Editar"; sidebar/página "Bankroll" → "Banca" (URL /bankroll mantida). Fontes 9-11px/contraste ainda em aberto.
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
