# AGENTS.md — Aposta Controlada

## Project Overview
Web spreadsheet for sports betting bankroll management — built with **Vite + React 18 + TypeScript**, Tailwind/shadcn/ui, TanStack Query, Supabase (Auth + Postgres RLS). Deploy target: Vercel.

## Key Commands
```bash
npm run dev          # Start dev server (Vite)
npm run build        # Typecheck (tsc -b) + production build → dist/
npm run typecheck    # tsc -b (run before commit/PR)
npm run lint         # ESLint (flat config, ignores dist/)
npm test             # Vitest run (jsdom, @testing-library/react)
```

## Architecture Notes
- **Domain logic** lives in `src/lib/calc.ts` (single-bet math: implied prob, EV, Kelly, American/decimal/frac conversion) and `src/lib/metrics.ts` (portfolio aggregations: ROI, yield, CLV, drawdown). Covered by unit tests.
- **Data access** via React Query hooks in `src/hooks/` (`useBets`, `useProfile`, etc.) wrapping the generated Supabase client (`src/integrations/supabase/client.ts`).
- **Supabase types** are generated (`src/integrations/supabase/types.ts`) — regenerate with `supabase gen types typescript` after schema changes.
- **Routes** in `src/pages/` (Dashboard, Bets, Bankroll, Analytics, Calendar, etc.); layout in `src/components/layout/`.
- **UI primitives** in `src/components/ui/` (shadcn/ui via Radix). Extend via `components.json` (shadcn config).
- **Auth flow** uses `window.location.origin` for email confirmation redirect — add prod domain to Supabase Auth "Redirect URLs".
- **Environment**: `.env` requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

## Verification Order (pre-commit/PR)
```bash
npm run typecheck && npm run lint && npm test
```
- TypeScript is strict; build fails on type errors (`tsc -b`).
- ESLint uses flat config, ignores `dist/`, `@typescript-eslint/no-unused-vars: off`.
- Tests use Vitest + jsdom + @testing-library/react; setup in `src/test/setup.ts`.

## Supabase Specifics
- Project ID: `cttdibubqgrpkdzhojtn` (in `supabase/config.toml`).
- Migrations in `supabase/migrations/` — apply via Supabase SQL Editor or CLI (`supabase db push`).
- Edge functions: `telegram-webhook` (JWT verification disabled for webhook), `tennis-refresh`.
- RLS is user-scoped on all data tables (`bets`, `bankroll_transactions`, `profiles`).

## Common Gotchas
- **CSV imports/exports**: use `;` delimiter and UTF-8 BOM (`utf-8-sig`) for Excel pt-BR compatibility.
- **Market taxonomy**: canonical list in `src/lib/marketSuggestions.ts` → `MARKETS_BY_SPORT`. New markets must be added there.
- **RLS on backup tables**: audit tables (`bets_market_fix_bak*`) have RLS disabled — enable with policies if exposing via API.
- **Generated types**: never edit `types.ts` manually; regenerate after migrations.
- **Rate limits**: Supabase client uses `localStorage` session persistence; auto-refresh token enabled.

## Files to Avoid Editing
- `src/integrations/supabase/types.ts` (auto-generated)
- `src/integrations/supabase/client.ts` (auto-generated wrapper)
- `dist/` (build output)
- `supabase/.temp/` (CLI cache)

## AI Model Rate Limits
- **Gemini 3.6 Flash**: 5 RPM / 250K input tokens/min / 20 RPD
- **GLM 5.2 (NVIDIA)**: 40 RPM

## References
- Handoff: `HANDOFF.md` (market taxonomy cleanup history)
- Motion spec: `MOTION-SPEC.md`
- Refactoring plan: `docs/PLANO-refatoracao-camadas.md`