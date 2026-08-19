# Handoff — Bankroll Pro (minha-banca-de-apostas)

> **Este arquivo não é mais o ponto de entrada.**
>
> O handoff vivo é **`C:\Projetos\planilha\HANDOFF.md`**, um nível acima deste repo.
> Comece pela seção **▶ COMECE AQUI** de lá.

## Por que os dois foram fundidos (19/08/2026)

Existiam dois handoffs em paralelo: este, dentro do repo, cobrindo código e ambiente;
e o da pasta `planilha\`, cobrindo a correção de mercados e seleções. Na prática o
segundo virou o único mantido, e este envelheceu sem que ninguém notasse — os itens
**#T1** (`tsc` no build) e **#T2** (regenerar tipos do Supabase) seguiram listados como
pendentes por semanas **depois de já terem sido resolvidos**, o que é pior que não ter
backlog nenhum: um pendente falso custa uma investigação inteira para ser desmentido.

Todo o conteúdo que só existia aqui foi migrado para o handoff vivo:

| Seção | Onde está agora |
|---|---|
| Corrupção da ponte FUSE | `⚠️ AMBIENTE: corrupção da ponte FUSE` |
| Regra de colaboração | `Regra de colaboração` |
| Stack & infra | `Stack & infra` |
| Arquivos centrais | `Arquivos centrais` |
| Backlog de código (#T1, #T2, #8, #15b, #A, #B, #17) | `Backlog de código` |
| Dívida técnica | `Dívida técnica registrada` |
| Changelog até 17/07/2026 | preservado no histórico do git deste arquivo |

O changelog detalhado das sessões até 17/07 (tênis, autocomplete, Telegram, identidade
visual, RPCs transacionais) continua acessível em:

```
git log -p -- HANDOFF.md
```

## Referências rápidas

- Instruções para agentes: `AGENTS.md`
- Motion spec: `MOTION-SPEC.md`
- Plano de refatoração em camadas: `docs/PLANO-refatoracao-camadas.md`
- Picklist canônica de mercados: `src/lib/marketSuggestions.ts`
