# Logos reais das casas de aposta

## Objetivo
Substituir os monogramas (quadrado colorido com 2-3 letras) por logos oficiais das casas no card das apostas, com fallback gracioso quando a logo não carregar.

## Abordagem
Usar o **Clearbit Logo API** (`https://logo.clearbit.com/{domain}`) — gratuito, sem chave, devolve PNG/SVG de alta qualidade a partir do domínio oficial da marca. Não precisa subir nenhum binário ao repositório, nem gerenciar assets.

Quando a imagem falhar ao carregar (404, marca sem domínio cadastrado, casa custom digitada pelo usuário), cai automaticamente no tile colorido com monograma que já existe hoje. Assim nada quebra.

## Mudanças

### 1. `src/lib/bookmakers.ts`
- Adicionar campo `domain?: string` em `BookmakerDef`.
- Preencher domínios oficiais das 20 casas listadas:
  - bet365 → `bet365.com`
  - betano → `betano.com`
  - betfair → `betfair.com`
  - sportingbet → `sportingbet.com`
  - kto → `kto.com`
  - superbet → `superbet.com`
  - estrelabet → `estrelabet.com`
  - pixbet → `pixbet.com`
  - blaze → `blaze.com`
  - novibet → `novibet.com`
  - betnacional → `betnacional.com`
  - bwin → `bwin.com`
  - 888sport → `888sport.com`
  - stake → `stake.com`
  - galera → `galera.bet`
  - esportesdasorte → `esportesdasorte.bet.br`
  - f12bet → `f12.bet`
  - pinnacle → `pinnacle.com`
  - betmgm → `betmgm.com`
  - esportivabet → `esportivabet.com.br`
- Helper `logoUrl(domain)` → `https://logo.clearbit.com/{domain}`.

### 2. `src/components/bookmakers/BookmakerLogo.tsx`
- Se a casa for conhecida e tiver `domain`, renderiza `<img src={logoUrl}>` dentro de uma tile branca arredondada (fundo claro para acomodar logos coloridos), com `object-contain` e padding.
- `onError` no `<img>` troca state `failed=true` → renderiza o tile colorido com monograma (comportamento atual) como fallback.
- Casas custom (sem entry conhecida) ou sem `domain` → tile monograma direto, como hoje.
- Mantém a API atual (`name`, `size`, `className`) — sem mudanças nos call sites (`BetCard`, `BookmakerSelect`, etc.).

## Observações técnicas
- Clearbit serve via HTTPS, com cache CDN, e suporta `?size=128`. Não precisa proxy.
- Não há custo, não há rate limit relevante para uso direto no browser.
- Sem migrações, sem novos pacotes, sem alteração de cálculos ou schema.
