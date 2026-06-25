# Aposta Controlada

Planilha web para **controle de apostas esportivas** — registro de apostas, gestão de banca (bankroll) e análise de desempenho (ROI, yield, taxa de acerto, drawdown, CLV, EV e Kelly). Inspirada em ferramentas como Bet-Analytix e bettin.gs.

## Stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (Radix)
- **TanStack Query** (estado de servidor) e **React Router**
- **Recharts** (gráficos)
- **Supabase** — autenticação e Postgres com Row Level Security por usuário

## Pré-requisitos

- Node.js 20+
- Um projeto **Supabase** com as tabelas/políticas das migrations (`supabase/migrations/`)

## Configuração

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o arquivo `.env` a partir do modelo e preencha com as chaves do seu projeto Supabase:

   ```bash
   cp .env.example .env
   ```

   | Variável | Descrição |
   |---|---|
   | `VITE_SUPABASE_URL` | URL do projeto Supabase |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key — segura no client sob RLS |
   | `VITE_SUPABASE_PROJECT_ID` | ID do projeto |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento (Vite) |
| `npm run build` | Gera o build de produção em `dist/` |
| `npm run preview` | Pré-visualiza o build de produção |
| `npm run lint` | Roda o ESLint |
| `npm test` | Roda os testes (Vitest) |

## Estrutura

```
src/
  components/   UI e blocos de tela (bets, bookmakers, layout, ui)
  hooks/        Acesso a dados via Supabase + React Query (useBets, useProfile, ...)
  lib/          Lógica de domínio pura — calc.ts (cálculos) e metrics.ts (agregações)
  pages/        Rotas (Dashboard, Apostas, Bankroll, Análises, Calendário, ...)
  integrations/ Cliente Supabase e tipos gerados
supabase/
  migrations/   Schema e políticas RLS
```

A lógica financeira fica isolada em `src/lib/calc.ts` e `src/lib/metrics.ts` e é coberta por testes (`*.test.ts`).

## Banco de dados

As tabelas (`profiles`, `bets`, `bankroll_transactions`), índices, triggers e políticas RLS estão em `supabase/migrations/`. Aplique-as no seu projeto Supabase via SQL editor ou Supabase CLI.

## Deploy

O projeto é um SPA Vite e pode ser publicado na **Vercel** (build `npm run build`, saída `dist/`). Lembre-se de:

- Configurar as variáveis de ambiente (`VITE_SUPABASE_*`) no painel da Vercel.
- Adicionar o domínio de produção às **Redirect URLs** permitidas no Supabase Auth (o app usa `window.location.origin` no fluxo de cadastro por e-mail).
