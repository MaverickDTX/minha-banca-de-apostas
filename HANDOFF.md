# Handoff — Bankroll Pro (minha-banca-de-apostas)

Data: 2026-07-01 (sessão encerrada por corrupção de ambiente — mas #16 foi COMMITADO e PUSHADO com sucesso antes da degradação. Corrupção reincidiu em sandbox genuinamente novo: 4ª manifestação, ver seção abaixo. Recomenda-se sandbox novo para continuar.)

## ✅ RESOLVIDO nesta sessão (2026-07-01, sandbox novo)
- **#16 Filtros de Apostas: COMMITADO E PUSHADO.** Commit `6f1e09f` em `origin/main` (push confirmado pelo usuário). Verificação canônica passou ANTES da degradação da ponte: `git fsck` limpo, blob de `src/pages/Bets.tsx` idêntico ao disco (555 linhas, última linha `}`, 19 marcadores), `tsc --noEmit` OK e `vite build` verde off-mount (`/tmp/verify` via `git archive`). Nada mais pendente do #16 — feature em produção.

## Stack & infra
- Vite + React 18 + TypeScript + shadcn/ui + TanStack Query + Supabase + React Router.
- Repo GitHub: `MaverickDTX/minha-banca-de-apostas`. Deploy: Vercel. URL: `minha-banca-de-apostas.vercel.app`. Marca no app: "Bankroll Pro".
- Supabase project: `cttdibubqgrpkdzhojtn` (sa-east-1).

## Regra de colaboração (LEIA SEMPRE)
Se uma ação for trivial para o usuário fazer manualmente fora do sandbox (ex.: apagar um arquivo, mover algo pelo Explorer/Finder, checar algo no navegador), **peça para o usuário fazer** em vez de gastar tokens tentando contornar/repetir a ação dentro do ambiente virtual. Isso vale especialmente para os problemas de corrupção de ambiente abaixo, onde tentativas de contorno via sandbox já se mostraram custosas e arriscadas.

## ⚠️ AMBIENTE: corrupção de montagem (LEIA PRIMEIRO)
Nesta sessão longa, a ponte de sincronização entre o disco (edições via Edit/Write) e o sandbox Linux (build/git) **degradou** e passou a servir **leituras truncadas e desatualizadas**. Consequências reais que ocorreram:
- `tsc` do sandbox validou versões "fantasma" (código antigo), dando falso OK.
- Um commit saiu com arquivos truncados; a feature Free bet foi **parcialmente perdida** num commit (BetForm sem o toggle, useBets sem o campo) e precisou ser recuperada.
- Scripts "ler-modificar-gravar" (sed/python in-place) leram truncado e **regravaram truncado**, danificando arquivos.

### Fluxo de trabalho seguro (USE SEMPRE)
1. Edite normalmente (Edit/Write) OU via `cat > arquivo <<'EOF'` no bash (escrita bash é confiável; leitura é que trunca).
2. **NUNCA** confie em `tsc`/grep/tail lidos da montagem como prova. Eles podem ler versão fantasma/truncada.
3. **Verificação canônica** = validar o que está COMMITADO, em área nativa fora da montagem:
   ```
   rm -rf /tmp/verify && mkdir -p /tmp/verify
   git archive HEAD | tar -x -C /tmp/verify
   ln -s "$(pwd)/node_modules" /tmp/verify/node_modules
   cd /tmp/verify && npx tsc --noEmit && npx vite build
   ```
   `git archive` lê do banco de objetos (imune à corrupção). Se passar aqui, é o que o Vercel builda.
4. Após cada commit, confira o blob: `git show HEAD:caminho | tail -1` e `| grep -c <marcador>` e `| awk 'END{print NR}'`. Se truncado, reconstrua a partir de `git show HEAD:caminho` (fonte confiável) + reaplique as edições, recopie e re-commite.
5. Se um arquivo grande truncar no disco: recupere com `git show HEAD:caminho > /tmp/x` (íntegro), edite em /tmp, copie de volta, re-verifique blob.
6. Poucos arquivos por rodada.
7. **Provável que um chat/sandbox novo resolva** a corrupção (remonta o FS do zero). Recomenda-se reiniciar.

### Nova manifestação (sessão 2026-07-01) — lock órfão + stat-cache mentiroso
Sessão curta, travou antes de commitar. Sintomas novos (não são os mesmos de truncamento da sessão anterior):
- `.git/index.lock` ficou órfão (criado durante um `git fetch`) e **nenhum comando remove**: `rm`, `mv`, `chmod` todos retornam `Operation not permitted`, mesmo sendo dono do arquivo (uid bate). `lsattr` retorna "Operation not supported". Isso bloqueia qualquer `git add`/`git commit`.
- Enquanto o lock existia, `git status` e `git diff HEAD` reportaram **"nothing to commit, working tree clean" de forma falsa** — o arquivo estava de fato alterado (confirmado com `diff` Unix puro e `md5sum` estável em leituras repetidas). O `stat` do sandbox reportava um `size` batendo com a versão *antiga* (a que está no índice do git), não com o conteúdo real. Ou seja: a ponte sandbox↔disco estava servindo metadado (stat) desatualizado mesmo quando o conteúdo lido (via `grep`/`cat`/`diff`) já estava correto — um desacoplamento entre cache de metadado e cache de dados.
- **Lição**: se `git status`/`git diff` disserem "limpo" mas você acabou de editar um arquivo, não confie — rode `diff <(git show HEAD:caminho) caminho` (diff puro, sem depender do índice do git) antes de aceitar que não há mudança.
- **Não houve commit quebrado desta vez** — o lock impediu o commit de sequer começar, então o repo ficou intacto em `8311adf` (= origin/main). Nenhum risco à produção.
- Arquivo `src/pages/Bets.tsx` foi editado nesta sessão (filtros da tarefa #16, ver abaixo) e **ficou gravado corretamente no disco real** (confirmado via `Read`, que grava/lê direto no disco, fora dessa ponte problemática) — só não foi commitado.

### Continuação (mesma sessão 2026-07-01) — lock persistiu mesmo após remoção manual pelo usuário; hipótese OneDrive investigada e descartada
- Usuário apagou `.git/index.lock` manualmente pelo Windows (fora do sandbox), conforme "Regra de colaboração" acima. Resultado: **inconsistência piorou em vez de sumir**. Rodei 4 checagens só-leitura em sequência na mesma sessão de shell sobre o mesmo arquivo: `ls -la` → reportou existindo; `stat` → reportou existindo (com uma linha de erro `ls: ... No such file or directory` vazada/intercalada de outro comando); `test -e` → `EXISTS`; `find .git -maxdepth 1 -name index.lock` → não encontrou nada. Três respostas dizem "existe", uma diz "não existe", uma saída veio contaminada — tudo na mesma sessão, mesmos comandos, milissegundos de diferença.
- **Hipótese investigada**: usuário sugeriu que a pasta do projeto estivesse sincronizada via OneDrive (Files-On-Demand), o que causaria exatamente esse tipo de leitura contraditória (placeholder de nuvem: `stat` mostra `Blocks: 0` com `Size > 0`, arquivo parece existir mas o conteúdo não está materializado localmente). Encontrei 2 issues abertas e não resolvidas no repo público `anthropics/claude-code` descrevendo esse exato padrão em sessões Cowork: [#62140](https://github.com/anthropics/claude-code/issues/62140) (corrupção silenciosa de arquivos em pastas OneDrive) e [#55627](https://github.com/anthropics/claude-code/issues/55627) (falha de leitura de placeholders do Google Drive Desktop). São relatos de terceiros, não confirmação oficial da Anthropic.
- Testei o sinal diagnóstico (`Blocks == 0` com `Size > 0`) em `Bets.tsx`, `package.json` e `.git/index` neste sandbox: **nenhum apresentou o padrão** — todos com blocos proporcionais ao tamanho (fisicamente presentes agora).
- **Usuário confirmou que a pasta `C:\Projetos\planilha\aposta-controlada-main` NÃO está no OneDrive.** Hipótese OneDrive **descartada** para este projeto — não perder tempo reinvestigando essa via em sessões futuras.
- **Causa raiz permanece não identificada.** O mount usado pelo sandbox é uma ponte FUSE própria da Anthropic (`type fuse`, via `/proc/self/fd/3`), não um compartilhamento de rede padrão nem indicador de nuvem — o bug pode estar nessa ponte mesmo sem qualquer serviço de sync de nuvem envolvido. Outras causas ainda não descartadas: outro processo no Windows segurando o arquivo aberto (IDE, antivírus, indexador de busca, backup local), ou definitivamente um bug na própria ponte FUSE do Cowork.
- **Recomendação para a próxima sessão**: abrir chat/sandbox novo (ainda não testado desta vez — só o lock foi removido manualmente, o sandbox continuou o mesmo). Se a inconsistência persistir num sandbox genuinamente novo, o problema é a ponte em si e vale reportar como bug (issues semelhantes já existem no repo `anthropics/claude-code`, ver acima) em vez de seguir tentando contornar.

### 4ª manifestação (sessão 2026-07-01, sandbox NOVO) — ponte FUSE é a causa confirmada
Esta é a evidência definitiva de que o bug está na **ponte sandbox↔disco do Cowork em si**, não em resíduo de ambiente anterior:
- Sandbox genuinamente novo (uptime 7 min). Checagem inicial de sanidade (`ls`/`stat`/`find` sobre `.git/index.lock`) veio **limpa e consistente**: sem lock, três leituras concordando. Por isso segui e commitei — correto.
- `git commit` do #16 **funcionou** (HEAD avançou pra `6f1e09f`, objeto gravado, fsck limpo), MAS emitiu vários `warning: unable to unlink ... Operation not permitted` em objetos temporários e **deixou um `.git/HEAD.lock` órfão** (0 bytes). Mesmo padrão do lock da sessão anterior: `rm`/`mv`/`chmod` do sandbox não removem.
- Usuário apagou `.git/HEAD.lock` manualmente pelo Windows. Depois disso, um único `ls -la .git/HEAD.lock` retornou **as duas respostas ao mesmo tempo**: a linha de erro `No such file or directory` E a linha de listagem `-rwx------ ... HEAD.lock`. Existência contraditória no mesmo comando.
- Um simples `git status --short` **gerou um novo `.git/index.lock` órfão** que não conseguiu remover (`Operation not permitted`).
- **Conclusão**: o mount é uma ponte FUSE própria da Anthropic (`type fuse`, `/proc/self/fd/3`). Ela serve metadado incoerente e impede unlink de arquivos que o próprio git cria, mesmo em sandbox limpo, sem OneDrive/nuvem envolvida (já descartado). **Escrita via ferramenta de arquivo (Edit/Write) continua confiável** — grava direto no disco real, fora dessa ponte (foi assim que `Bets.tsx` e este HANDOFF sobreviveram). Só operações git/`ls`/`stat` pela montagem é que corrompem.
- **Vale reportar** nas issues `anthropics/claude-code` #62140 / #55627 com este caso concreto (ls contraditório + index.lock órfão gerado por `git status` em sandbox de 7 min).
- **Ação para a próxima sessão**: abrir sandbox NOVO. Se o git vier limpo, commitar este HANDOFF atualizado e seguir para o autocomplete de eventos (ver Pendências #A). Se a corrupção reincidir já no primeiro commit, considerar que o contorno via sandbox não é confiável e priorizar o report do bug.

## Estado do código
- `origin/main` = HEAD local = `6f1e09f` (#16). **Push feito e confirmado pelo usuário.** Este HANDOFF.md foi editado no disco mas **NÃO commitado** (git travado pela corrupção) — primeiro passo do próximo sandbox: commitar o HANDOFF.
- (anterior) `8311adf` era o HEAD antes do #16.
- **Vercel confirmado verde**: deployment de produção do projeto `minha-banca-de-apostas` (Vercel project `prj_hcUkqTqn4ptuKVI2DUKB56BNO5Uh`, team `stake-pro`) com `readyState: READY`, buildado a partir de `8311adf`. Nada pendente de push/deploy das sessões anteriores.
- Últimos commits em `origin/main`: `6f1e09f` (#16 filtros avançados de Apostas), `8311adf` (recuperação da UI do Free bet no BetForm + label enxuto + fix useBets), `633c4d7` (Configurações em boxes + casas personalizadas + tema sol/lua).

### PENDENTE DE COMMIT
- Apenas **este HANDOFF.md** (editado no disco nesta sessão, git travado). Commitar no próximo sandbox.
- O #16 (`Bets.tsx`) **já está commitado e pushado** em `6f1e09f` — ver "RESOLVIDO nesta sessão" no topo. Não reimplementar.

## Concluído nesta sessão
- Logos locais das 20 casas (assets em `src/assets/bookmakers/`), full-bleed; infra Clearbit removida. Bwin/888sport → BetWarrior/Betsson.
- ROI (=lucro/banca inicial, no Dashboard) e Yield (=lucro/turnover) separados. Coluna Analytics = "Yield".
- Autocomplete Mercado/Seleção multi-esporte (`marketSuggestions.ts`).
- Autocomplete de Tipster + cadastro em Configurações (`profiles.tipsters`).
- Seletor de página em Apostas (`BetsPagination.tsx`).
- Free bet (SNR): `bets.is_free_bet`; calc SNR (derrota=0, stake fora do turnover); toggle "Free bet (aposta grátis)" no BetForm.
- Configurações em boxes (Perfil, Apostas, Casas com cadastro custom, Tipsters, Aparência com toggle sol/lua). `profiles.bookmakers`; BookmakerSelect mescla casas custom.
- Fixes: botão Voltar na edição; seleção não reseta ao trocar mercado; subtítulo "Minha Banca de Apostas".

## Banco (já aplicado no Supabase — sem push necessário)
- 1109 apostas: Seleção movida de `market`→`selection`. Backup `bets_backup_market_swap_20260630` (RLS + PK).
- Tradução eventos: " v "→" x " (848) + países EN→PT (173, sufixos (W)/U20/U23 preservados). Seleções em inglês mantidas.
- RLS otimizado (16 políticas com `(select auth.uid())`).
- Migrações: tipsters, is_free_bet, bookmakers em profiles.

## Pendências (tarefas) — em ordem de impacto
- ~~**#16 Filtros de Apostas**~~ — ✅ CONCLUÍDO nesta sessão (`6f1e09f`, pushado).
- **#A Autocomplete de EVENTO só traz futebol** (BUG reportado ativamente pelo usuário). O autocomplete de partida/evento (não os campos Mercado/Seleção — esses estão OK e cobrem Futebol/Tênis/Basquete) só retorna jogos de futebol. Usuário testou "Sinner x Borges" (tênis) hoje e **não preencheu nada**. Fonte a investigar: `src/lib/sportsdb.ts` (provável fonte de dados/endpoint) alimentando `src/components/bets/EventAutocomplete.tsx`, consumido em `BetForm.tsx` via `applyEventPick`. Hipótese a confirmar (leitura já iniciada, não concluída): a busca em `sportsdb.ts` pode estar filtrando/consultando só liga/esporte de futebol, ou o endpoint da TheSportsDB usado só cobre futebol. Diagnosticar em modo leitura antes de editar. **Alta prioridade** — usuário está esbarrando nisso.
- **#14 Logo/identidade**: atual quase idêntico ao "Pro Stake Manager". Trocar ícone (fichas/cofre/alvo/monograma), cor, wordmark. Definir vibe com usuário. Arquivos: `AppSidebar.tsx`, `Auth.tsx`, `index.html`.
3. **#15 restante — Segurança nas Configurações**: seção trocar senha + apagar conta (Supabase Auth; apagar conta é destrutivo, tratar com cuidado).
4. **#17 Dashboard personalizável** (escolher KPIs/cards). Baixa prioridade.
5. **#18 Recortes de tempo** (7/14/30/90 dias, por ano) nas Análises. Barato.
6. **Adiado — Winning bonus/boost**: campo separado p/ não sujar CLV/EV.

## Fora do código (usuário, dashboard)
- Supabase → Authentication → URL Configuration: trocar URL antiga pela nova.
- Leaked Password Protection: exige Pro (usuário Free) — deixado off.
- Tabela de backup: manter até validar; depois `DROP`.

## Arquivos centrais
- Form/apostas: `src/components/bets/BetForm.tsx`, `LegsEditor.tsx`, `TipsterAutocomplete.tsx`, `MarketAutocomplete.tsx`, `SelectionAutocomplete.tsx`, `BetsPagination.tsx`, `src/components/bookmakers/BookmakerSelect.tsx`.
- Cálculo/métricas: `src/lib/calc.ts`, `metrics.ts`, `marketSuggestions.ts`.
- Páginas: `src/pages/Bets.tsx`, `NewBet.tsx`, `Settings.tsx`, `Dashboard.tsx`, `Analytics.tsx`, `Bankroll.tsx`.
- Dados: `src/hooks/useProfile.ts`, `useBets.ts`, `src/integrations/supabase/types.ts`.
