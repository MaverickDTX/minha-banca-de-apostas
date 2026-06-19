## O que vai mudar

Os campos que você listou (evento, liga, casa, mercado, tipo, odd, fechamento, unidade e status) **já existem** no banco e no formulário. O que está faltando é deixá-los visíveis e bonitos no card da aposta, e turbinar o seletor de casa com logos. Também vou reforçar os cálculos automáticos para serem recalculados em toda edição (não só na criação).

### 1. Catálogo de casas de aposta com logos

Criar `src/lib/bookmakers.ts` com as principais casas do mercado brasileiro/internacional, cada uma com nome, cor de marca e logo via Lovable Assets (SVG/PNG hospedados no CDN):

Bet365, Betano, Betfair, Sportingbet, KTO, Superbet, Estrela Bet, Pixbet, Blaze, Novibet, BetNacional, Bwin, 888sport, Stake, Galera.bet, EsportesDaSorte, F12.bet, Pinnacle, BetMGM, Esportiva.bet.

Cada logo será baixado/gerado e enviado para o CDN; o catálogo guarda o `url` do `.asset.json`. Também aceita casa "personalizada" (texto livre, sem logo — mostra inicial em monograma colorido).

### 2. Novo componente `BookmakerSelect`

Combobox com busca, miniatura do logo ao lado do nome e opção "Outra…" para digitar manualmente. Substitui o `Input` de texto livre atual no `BetForm` (modo Rápido e Avançado).

### 3. Cards de aposta na página `/apostas`

Substituir a tabela por uma grade responsiva de cards (1 coluna no celular, 2 no desktop) com:

```text
┌─────────────────────────────────────────────┐
│ [LOGO]  Bet365            [Badge: Green]    │
│ Brasileirão · Futebol · Pré-live · 18/06    │
│                                              │
│ Flamengo x Palmeiras                        │
│ Resultado final — Flamengo vence            │
│                                              │
│ Odd 2.10   Stake R$ 50 (5u)   CLV +3.2%    │
│ ─────────────────────────────────────────── │
│ Lucro  +R$ 55,00                  ⋯ menu   │
└─────────────────────────────────────────────┘
```

A borda esquerda do card recebe a cor do status (verde / vermelho / cinza / âmbar). Filtros e totais no topo continuam iguais; ganha alternância "Cards / Tabela" para quem preferir a planilha densa.

### 4. Ajustes no formulário (`BetForm`)

- `BookmakerSelect` no lugar do input de texto.
- Mostrar **unidades** calculadas em tempo real (`stake / unit_value`) e permitir digitar em unidades (campo extra que recalcula a stake).
- Painel de cálculos passa a sempre exibir: prob. implícita, retorno potencial, lucro potencial, stake/banca, EV, edge, Kelly, CLV — com formatação consistente.
- Validar que `closing_odds` só preenche CLV quando faz sentido (já está, mantido).

### 5. Cálculos automáticos consistentes na edição

Hoje o "Marcar Green/Red/Void/Pendente" no menu rápido recalcula `net_profit` e `gross_return`, mas ignora half_green/half_red/cashout. Vou:

- Centralizar o recálculo numa função `recomputeBetDerived(bet, patch)` em `src/lib/calc.ts` que devolve `{ net_profit, gross_return, implied_probability, edge, ev, kelly_fraction, recommended_stake, clv }` a partir dos campos atuais.
- Usar essa função no `useUpdateBet` e nas ações rápidas, garantindo que qualquer mudança em odd, stake, status, closing_odds, prob. estimada recalcule tudo automaticamente.

### 6. Detalhes técnicos

- Logos via `lovable-assets create --file ... > src/assets/bookmakers/<slug>.png.asset.json`, importados no catálogo.
- Cards usam tokens semânticos do `index.css` (sem cores hardcoded).
- Nenhuma migração de banco — o schema já contempla tudo.
- `Bets.tsx` é refatorado para usar `<BetCard />` (componente novo) + modo tabela preservado atrás de um toggle.

### O que **não** muda agora

- Importação CSV, dashboard, analytics, calendário, bankroll — ficam como estão.
- Integração com APIs de odds — segue como espaço reservado para depois.
