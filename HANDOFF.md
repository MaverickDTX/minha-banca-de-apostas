# Handoff — Bankroll Pro (minha-banca-de-apostas)

Data: 2026-07-01

## ✅ RESOLVIDO nesta sessão

### #16 Filtros de Apostas
COMMITADO E PUSHADO. Commit `6f1e09f` em `origin/main`. Feature em produção, não mexer.

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

## Stack & infra
- Vite + React 18 + TypeScript + shadcn/ui + TanStack Query + Supabase + React Router.
- Repo GitHub: `MaverickDTX/minha-banca-de-apostas`. Deploy: Vercel. URL: `minha-banca-de-apostas.vercel.app`. Marca: "Bankroll Pro".
- Supabase project: `cttdibubqgrpkdzhojtn` (sa-east-1).
- APIs externas: TheSportsDB (key `3`, free, sem cadastro) + API-Sports (key em env var, free tier 100 req/dia/esporte).

## Regra de colaboração (LEIA SEMPRE)
Se uma ação for trivial para o usuário fazer manualmente fora do sandbox (ex.: apagar um arquivo, rodar git), **peça para o usuário fazer** em vez de gastar tokens tentando contornar.

## ⚠️ AMBIENTE: corrupção da ponte FUSE
A ponte sandbox↔disco do Cowork (mount FUSE via `/proc/self/fd/3`) tem bug confirmado em 5 manifestações ao longo de 3 sessões. Sintomas: leituras truncadas, stat-cache mentiroso, `ls` contraditório, locks órfãos irremovíveis (`Operation not permitted`), `git status` reportando "clean" de forma falsa.

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
- **#A expansão multi-esporte**: rotear API-Sports fallback pelo sport selecionado (basketball, MMA, etc.). Endpoints disponíveis, não implementados.
- **#14 Logo/identidade**: trocar ícone e cor. Arquivos: `AppSidebar.tsx`, `Auth.tsx`, `index.html`.
- **#15 Segurança nas Configurações**: trocar senha + apagar conta (Supabase Auth).
- **#17 Dashboard personalizável** (KPIs/cards). Baixa prioridade.
- **#18 Recortes de tempo** (7/14/30/90 dias) nas Análises.
- **Adiado — Winning bonus/boost**: campo separado p/ não sujar CLV/EV.

## Fora do código (dashboard)
- Supabase → Authentication → URL Configuration: trocar URL.
- Tabela de backup `bets_backup_market_swap_20260630`: manter até validar; depois `DROP`.

## Arquivos centrais
- Autocomplete eventos: `src/lib/sportsdb.ts`, `src/lib/apisports.ts`, `src/components/bets/EventAutocomplete.tsx`.
- Form/apostas: `src/components/bets/BetForm.tsx`, `LegsEditor.tsx`, `TipsterAutocomplete.tsx`, `MarketAutocomplete.tsx`, `SelectionAutocomplete.tsx`, `BetsPagination.tsx`, `src/components/bookmakers/BookmakerSelect.tsx`.
- Cálculo/métricas: `src/lib/calc.ts`, `metrics.ts`, `marketSuggestions.ts`.
- Páginas: `src/pages/Bets.tsx`, `NewBet.tsx`, `Settings.tsx`, `Dashboard.tsx`, `Analytics.tsx`, `Bankroll.tsx`.
- Dados: `src/hooks/useProfile.ts`, `useBets.ts`, `src/integrations/supabase/types.ts`.
- Tradução: `src/lib/translate.ts`.
