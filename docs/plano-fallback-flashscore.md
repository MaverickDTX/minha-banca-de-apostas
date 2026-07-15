# Plano — Fallback de tênis via Flashscore4 (RapidAPI)

Status: **rascunho / em validação incremental**
Autor do handoff anterior: agente token-free. Este plano cobre o passo seguinte.

## Contexto

O provedor primário de tênis (Matchstat / `tennis-api-atp-wta-itf.p.rapidapi.com`)
estourou a **cota diária** do plano BASIC do RapidAPI (HTTP 429 —
"exceeded the DAILY quota"). Enquanto a cota está estourada, TODA busca de tênis
retorna vazio, não só o confronto específico (ex.: Daniel Jade / Alexandre Aubriot).

Objetivo: usar o **Flashscore4** (`flashscore4.p.rapidapi.com`) como fonte de
fallback quando o primário falhar — com atenção especial a ITF e Challenger, onde
a cobertura do primário é fraca e onde estão os casos que motivaram o handoff.

### Diagnóstico do caso original (Jade x Aubriot) — RESOLVIDO

O confronto **Jade D. x Aubriot A.** existe: `match_id=MaL6NIv0`,
`/tennis/itf-men-singles/m25-uriage/` (ITF M25 Uriage, França), **em 2026-07-15**
(jogo FUTURO — era o dia seguinte quando diagnosticado). Aparece no endpoint
`players/tennis/fixtures` do Jade (`ABqFnqUJ`), não no `results` (histórico).

Ou seja: a busca vinha vazia **não** por falha de cobertura ITF, e sim porque
(a) o primário estava em 429 de cota diária, mascarando tudo como "nenhum evento", e
(b) é um jogo futuro — só está em `fixtures`, não em `results`.
Correção de premissa: o `players/tennis/fixtures` NÃO é inútil (havia retornado `[]`
só porque o Alcaraz não tinha jogo agendado no instante). Ele é necessário.

## Descobertas validadas (testes manuais via PowerShell)

Chave: **a mesma** `X-RapidAPI-Key` da conta RapidAPI serve para todos os hosts.
Portanto **não é preciso nova secret no Vault** — o proxy já lê `TENNIS_RAPIDAPI_KEY`.
O que muda por provedor é apenas o header `X-RapidAPI-Host` e o path.

### Endpoints do Flashscore4 relevantes

1. **Busca por nome** — `GET /api/flashscore/v2/general/search?q={texto}`
   - Retorna array de entidades (jogadores E times, vários esportes misturados).
   - Cada item: `{ id, type, name, url, sport:{id,name}, gender, country_name, ... }`.
   - **Tênis = `sport.id == 2`.** Filtrar por isso (a busca mistura futebol).
   - `type` pode ser `player` (tênis individual) — usar esses.
   - Ex.: buscar "alcaraz" → `{"id":"UkhgIFEq","type":"player","name":"Alcaraz Carlos","sport":{"id":2,"name":"Tennis"}}`.

2. **Histórico do jogador** — `GET /api/flashscore/v2/players/tennis/results?player_id={id}&type=singles&page=1`
   - Retorna histórico agrupado **por torneio**: `[{ tournament_url, name, matches:[...] }, ...]`.
   - Cada match: `{ match_id, timestamp (Unix), home_team:{player_id,name,...}, away_team:{...}, scores, is_winner }`.
   - `type=singles` é obrigatório; duplas exigem `type=doubles` (não necessário p/ o caso atual).
   - **~2 chamadas por busca** (search + results). Sustentável.

3. **(descartado p/ uso corrente)** `GET /api/flashscore/v2/matches/list-by-date?sport_id=2&date=YYYY-MM-DD`
   - Lista TODAS as partidas de tênis de um dia (ATP/WTA/Challenger/ITF completo, com odds).
   - Cobertura excelente, mas **1 request por dia** → varrer janela de 30 dias = ~30 req/busca.
   - Inviável no plano de 500/mês (cada busca ≈ 6% da cota). Reservar só para casos pontuais com data conhecida.

4. **Jogos futuros** — `GET /api/flashscore/v2/players/tennis/fixtures?player_id={id}&page=1`
   - Traz partidas FUTURAS agendadas do jogador (mesmo shape do `results`, sem `scores`).
   - Retorna `[]` para jogador sem jogo marcado (ex.: Alcaraz entre torneios) — NÃO é bug.
   - **Necessário** junto com `results`: o usuário pode buscar jogo passado OU futuro.
   - Em duplas, `home_team`/`away_team` vêm como **arrays** de jogadores (validado com Jade em Uriage).

### Restrição de cota — CRÍTICA

Plano Flashscore4 no RapidAPI: **500 requests / MÊS**, hard limit, 1000/hora.
- `search → results` = ~2 req/busca → ~250 buscas/mês. Aceitável como fallback.
- `list-by-date` varrendo 30 dias = ~30 req/busca → ~16 buscas/mês. **Não usar** como padrão.
- Conclusão: o fallback só é sustentável pela cadeia **search → results**.

## Mapeamento Flashscore `results` → `SportEvent`

Shape-alvo (já usado em `src/lib/tennis.ts` e `src/lib/sportsdb.ts`):

```ts
type SportEvent = {
  id: string; name: string; sport: string; league: string;
  date: string | null; homeTeam?: string; awayTeam?: string;
};
```

Conversão de cada match do Flashscore:

| SportEvent   | Origem no Flashscore results                                   |
|--------------|----------------------------------------------------------------|
| `id`         | `tennis-fs-{match_id}`                                          |
| `homeTeam`   | `home_team.name` (abreviado, ex. "Tauson C.")                  |
| `awayTeam`   | `away_team.name`                                               |
| `name`       | `` `${home} x ${away}` ``                                      |
| `sport`      | `"Tênis"`                                                     |
| `league`     | derivar de `tournament_url` → ATP / WTA / Challenger / ITF     |
| `date`       | `new Date(timestamp * 1000).toISOString()` (timestamp é Unix s)|

Notas de parsing:
- Resposta agrupada por torneio → achatar (`flatMap` sobre `matches`).
- `tournament_url` ex.: `/tennis/itf-men-singles/m15-lodz/`, `/tennis/challenger-men-singles/iasi/`,
  `/tennis/wta-singles/wimbledon/`. Extrair o segmento após `/tennis/` para o tour/nível.
- Nomes vêm **abreviados** ("Fery A.", "Sinner J."). O filtro por texto do usuário
  precisa casar por **sobrenome**, não nome completo (`matchesTennisQuery` já normaliza,
  mas a heurística de confronto pode precisar de ajuste para sobrenomes abreviados).
- Duplas: `home_team`/`away_team` podem ser **arrays** (no `list-by-date`); no
  `results?type=singles` são objetos. Tratar defensivamente se algum dia usar doubles.

## Arquitetura proposta

Padrão já existente no projeto: "primário resolve → retorna cedo; senão próxima fonte"
(ver `searchEvents` em sportsdb.ts, com fallback TheSportsDB e MMA multi-fonte).

### Onde encadear

Duas opções:

**Opção A — no cliente (`tennis.ts`).** `searchTennisMatches` tenta Matchstat;
se `loadWindow` voltar vazio/incompleto por 429, chama uma nova
`searchTennisFlashscore(query)` que faz search+results via proxy e normaliza.
- Prós: isola a lógica no front, onde a normalização de shape já vive.
- Contras: o cliente passa a conhecer dois formatos.

**Opção B — no proxy (`tennis-fixtures`).** A edge function tenta Matchstat;
no 429, cai para Flashscore e **normaliza server-side**, devolvendo sempre o
mesmo shape. Cliente não muda.
- Prós: cliente agnóstico; chave e normalização num só lugar.
- Contras: proxy hoje é rígido (host/path fixos); precisa refatorar para multi-provedor
  e para encadear duas chamadas (search+results) numa resposta.

> Recomendação preliminar: **Opção A** para a primeira iteração (menor raio de
> mudança, testável no front com Vitest), evoluindo para B se o padrão se repetir.
> Decisão pendente do Matheus.

### Proxy — ajuste mínimo necessário (qualquer opção)

O `tennis-fixtures/index.ts` hoje aceita só `type ∈ {atp,wta,itf}` e monta
`/tennis/v2/${type}/fixtures/...` no host Matchstat. Para o Flashscore, o proxy
precisa aceitar um novo modo, ex.: `{ provider: "flashscore", path: "...", host: "..." }`
ou endpoints dedicados (`fs-search`, `fs-results`). Manter a mesma chave do Vault.

### Gatilho do fallback

Só cair para o Flashscore quando o Matchstat sinalizar **429 / carga incompleta**
(hoje `loadTour` retorna `complete:false` nesse caso). NÃO usar Flashscore como
fonte primária — preservar a cota de 500/mês.

## Passos de implementação (incremental, com teste a cada etapa)

1. [x] Proxy: aceita `{ provider:"flashscore", path }` → host `flashscore4.p.rapidapi.com`,
       reusa a mesma chave do Vault. Modo Matchstat intacto. **Publicado** (deploy 2026-07-14).
2. [x] `parseFlashscoreMatches(json) → SportEvent[]` — função pura, testada com JSON real
       (results da Tauson e fixtures do Jade, incluindo duplas em array). `src/lib/flashscore.ts`.
3. [x] `deriveTour(tournament_url)` → ATP/WTA/Challenger/ITF/Juvenil — função pura + teste.
4. [x] `searchTennisFlashscore(query)` — search (filtra sport.id==2) → results+fixtures → parse
       → filtra por **sobrenome** (resolve nomes abreviados "Jade D."). `src/lib/tennis.ts`.
5. [x] Ligado como fallback em `searchTennisMatches` só quando o primário volta 429.
6. [x] 2 testes de integração (fallback acha Jade×Aubriot; marca cota quando FS também falha).
       Fake timers → suíte roda em ~10ms. 28 testes OK, tsc limpo, build compila 3049 módulos.
7. [x] UX: mensagem "Busca de tênis temporariamente limitada pela fonte (cota diária)…"
       quando ambas falham por cota (`EventAutocomplete.tsx`). Validado no app.

### Diagnóstico final (por que "Aubriot" falhava mesmo com tudo implementado)

Duas causas, ambas corrigidas:
1. **Deploy desatualizado** — a versão publicada do proxy não tinha o modo Flashscore;
   `{provider:"flashscore"}` caía na validação Matchstat e retornava HTTP 400. Republicado.
2. **`break` prematuro** em `searchTennisFlashscore` — parava no primeiro player_id com
   qualquer jogo, então num confronto "A x B" podia nunca chegar ao id que continha o
   confronto. Corrigido: só para quando há evento que SATISFAZ o filtro de confronto.

Validado no app em 2026-07-14: busca "Aubriot" lista os confrontos ITF via fallback.

### Performance — circuit breaker (2026-07-14)

Sintoma: com o Matchstat em cota diária estourada, TODA busca (inclusive futebol/
MMA, que chamam o tênis como fonte secundária) gastava ~9s nos 6 tours × 3 retries
de 429 antes de desistir.

Correção em `tennis.ts`:
- Circuit breaker de módulo (`COOLDOWN_MS = 10min`): após um 429, `loadTour` arma
  `tripMatchstatBreaker()`; enquanto armado, `searchTennisMatches` pula o Matchstat
  e vai direto ao fallback (ou retorna vazio). Passado o cooldown, retenta o primário.
- Parâmetro `opts.allowFlashscore` (default false): o fallback Flashscore só dispara
  na busca PRIMÁRIA de tênis (`sportsdb.ts` passa `true`). Como fonte secundária, o
  tênis não gasta cota do Flashscore nem trava a busca de outros esportes.
- `__resetMatchstatBreaker()` exportado só para testes (estado de módulo).

## Riscos / pendências (restantes, NÃO-código)

- **Rotacionar a `X-RapidAPI-Key`** — exposta em texto durante os testes manuais.
  Trocar no RapidAPI e atualizar a secret `TENNIS_RAPIDAPI_KEY` no Vault (uma chave
  serve os dois hosts). **Antes de qualquer commit/push.**
- **Cota compartilhada?** Confirmar no dashboard RapidAPI se o Flashscore4 tem balde
  próprio (500/mês) independente do Matchstat.
