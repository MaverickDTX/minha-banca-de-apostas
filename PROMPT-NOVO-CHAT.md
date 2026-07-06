# Prompt — aplicar MOTION-SPEC + AUDIT no app (colar num chat novo)

Copie tudo abaixo da linha para dentro de um chat novo com o agente de código (Claude Code / Cursor), com o projeto aberto.

---

Você vai trabalhar no **Minha Banca de Apostas**: app React 18 + Vite + Tailwind v3 + framer-motion 12, tema dark, fonte Plus Jakarta Sans. É um dashboard de usuário único, autenticado (não é site de marketing).

Dois documentos na raiz do projeto guiam este trabalho. **Leia os dois, inteiros, antes de tocar em qualquer arquivo:**
- `MOTION-SPEC.md` — a linguagem de movimento do app (tokens, reduced-motion, regras por página).
- `AUDIT-DASHBOARD.md` — achados de auditoria já filtrados para este app (o que já está feito, o que ignorar, e os 3 achados reais).

## Princípios inegociáveis (valem para todas as etapas)
- Trabalhar com a stack existente. Não migrar framework nem biblioteca de estilo. Não reescrever do zero — melhorar o que existe.
- Não alterar layout, dados, cópia, rotas nem nomes de campo. Apenas a camada de movimento e os itens visuais dos achados.
- Em animação, apenas `transform` e `opacity`. Zero `top/left/width/height`.
- Nenhum pacote novo: usar o `framer-motion` já instalado.
- **Não "consertar" falsos positivos** (§2 do audit): nada de hero, glassmorphism, inertia scroll, parallax, kinetic type. A `MOTION-SPEC.md` prevalece sobre qualquer seção "Upgrade Techniques".
- Valores contínuos (count-up, ponteiro) via `useMotionValue`/`useTransform` — nunca `useState` em loop de frame.
- Nenhuma easing/duração hard-coded: tudo vem de `src/lib/motion.ts`.
- Testar após cada mudança. Diffs pequenos e revisáveis.

## Executar nesta ordem — PARAR para eu revisar entre cada etapa

**Etapa 1 — Fundação reduced-motion (audit §3.1 + spec §2). Fazer sozinha primeiro.**
- Envolver a árvore da app em `<MotionConfig reducedMotion="user">` (em `App.tsx` ou `main.tsx`).
- Adicionar o kill-switch CSS `@media (prefers-reduced-motion: reduce)` da spec §2A em `src/index.css`.
- Criar `src/lib/motion.ts` com os tokens da spec §1 (EASE, DUR, SPRING, RISE, STAGGER).
- Nada além disso nesta etapa.

**Etapa 2 — Dashboard (spec §4).**
- Migrar as durações/easings inline (`fadeUp`, `stagger` em `Dashboard.tsx`) para os tokens de `motion.ts`.
- Manter o stagger dos cards (grupo pequeno, ok).
- Se houver count-up de KPI, usar `useMotionValue`/`animate`/`useTransform`, sem re-render por frame.
- Hover/active já existem no `StatCard` — não duplicar.

**Etapa 3 — Bets (audit §3.2 + spec §5).**
- Resolver o re-disparo do stagger a cada página/filtro: trocar por fade único do contêiner OU animar só no primeiro mount.
- Confirmar que nada anima por-linha além dos ~20 itens paginados.
- Permitido: micro-pop no badge na mudança de status (Pendente → Ganha/Anulada) — feedback motivado.

**Etapa 4 — Analytics (spec §6).**
- Animação nativa do gráfico só quando `!useReducedMotion()`.
- Cross-fade na troca de período; count-up nos números-resumo via motion value.
- Sem scroll-reveal em gráfico.

**Etapa 5 — A11y de foco (audit §3.3).**
- Adicionar `focus-visible:ring-2 focus-visible:ring-ring` às opções dos autocompletes (`EventAutocomplete`, `MarketAutocomplete`, `SelectionAutocomplete`, `TipsterAutocomplete`) — foco distinto do hover.

## Ao final de CADA etapa
- Rodar o checklist da §7 da `MOTION-SPEC.md` e reportar item a item (passou / não passou).
- Mostrar o diff de cada arquivo alterado.
- Corrigir o que não passou antes de seguir para a próxima etapa.

Comece pela Etapa 1 e pare para eu revisar.
