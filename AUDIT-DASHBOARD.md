# Audit filtrado — redesign-existing-projects aplicado ao seu `src/`

Auditoria real do código (não do checklist genérico). Foram lidos `Dashboard.tsx`, `Bets.tsx`, `StatCard.tsx`, `index.css`, autocompletes e config. Só entram itens do audit da skill `redesign-existing-projects` que (a) fazem sentido para um dashboard de usuário único e (b) ainda não estão resolvidos no seu código.

**Veredito de cabeçalho:** seu app já passa na maioria das checagens relevantes. A skill, rodada crua, geraria muitos falsos positivos aqui — porque ela é, no fundo, um audit de site de marketing, e a maior parte do que ela quer adicionar é justamente o que vocês corretamente não têm.

---

## 1. Já está feito (não mexer — corrige suposições anteriores)

- **Algarismos tabulares:** `index.css` já aplica `font-variant-numeric: tabular-nums` globalmente (`body`, `.font-mono`, `.tabular`). `.stat-value` usa `font-mono`, então os KPIs já têm dígitos de largura fixa. O "item de ouro" já existe.
- **Foco de teclado:** `StatCard` (card clicável de drill-down) tem `focus-visible:ring-2 ...ring-offset-2` correto. Componentes shadcn (`button`, `input`, `switch`, `tabs`) trazem focus-visible de fábrica.
- **Reduced-motion na camada CSS:** `StatCard` usa `motion-safe:` em todas as transições/hover/active (compila para `@media (prefers-reduced-motion: no-preference)`).
- **Sem preto puro de fundo:** `#000` só aparece como scrim de modal (`bg-black/80` em dialog/sheet/alert-dialog) — uso padrão, correto.
- **Sem `window.alert`.** Sem cliché de cópia relevante (é app de dado, não marketing).
- **Acento único + cores semânticas:** verde de acento, com `positive/negative/neutral` semânticos (âmbar/vermelho para estado). Isso é exceção legítima, não "segundo acento".
- **Stagger do Dashboard:** `staggerChildren 0.05` sobre 4 e 6 cards — grupo pequeno, dentro do que a motion-spec permite.

## 2. Falsos positivos — a skill levantaria, ignore

Hero, feature rows, pricing de 3 torres, carrossel de depoimentos, footer link farm, "trusted by", legal/privacy/ToS, cookie consent, og:image, 404 branded, datas de blog, stock de "diverse team", nomes fake (John Doe/Acme), Lorem Ipsum. **Nada disso se aplica** a um rastreador de banca autenticado. E toda a seção "Upgrade Techniques" da skill (inertia scroll, parallax, glassmorphism, kinetic type) é contraindicada — a `MOTION-SPEC.md` prevalece.

## 3. Achados reais (ordenados: baixo risco / alto valor primeiro)

### 3.1 — framer-motion NÃO respeita reduced-motion  ·  ALTO valor / BAIXO risco
A camada CSS usa `motion-safe:`, mas as animações **framer-motion** não. `Dashboard.tsx` (linhas 179–192: `motion.div variants={fadeUp}`, y-translate + fade, stagger) e `Bets.tsx` (linha 411+) rodam igual para quem pediu movimento reduzido. `motion-safe:` (Tailwind) não cobre animação JS do framer-motion.

**Correção (uma linha, global):** envolver a árvore em `<MotionConfig reducedMotion="user">` (em `App.tsx` ou `main.tsx`). Isso faz o framer-motion pular automaticamente animações de transform/layout para quem tem reduced-motion, preservando opacidade. Resolve Dashboard e Bets de uma vez. É também o requisito §2 da motion-spec.

### 3.2 — Stagger de Bets re-dispara a cada página/filtro  ·  MÉDIO
`Bets.tsx` linha 26–28: `staggerChildren 0.03, delayChildren 0.05` sobre `paginated` (~20 itens). Não são as 1.357 linhas (a lista é paginada, `pageSize=20`), então não é catástrofe. Mas `initial="hidden" animate="visible"` re-anima a cascata inteira a **cada troca de página ou filtro** — ~600ms de cascata chamando atenção para uma atualização rotineira de dado.

**Opções (escolher uma):** (a) trocar o stagger por um fade único do contêiner; ou (b) animar só no primeiro mount, não a cada mudança de página; ou (c) manter, mas cortar `staggerChildren` para ~0.015. Preferência: (a) ou (b), alinhado ao espírito "motion comunica, não decora".

### 3.3 — Opções de autocomplete: `outline-none` sem anel de foco distinto  ·  BAIXO/MÉDIO (a11y)
`EventAutocomplete.tsx` linha 97 e `MarketAutocomplete.tsx` linha 60 (e irmãos): botões de opção com `outline-none` e só `focus:bg-muted/60` — mas `hover` usa o **mesmo** `bg-muted/60`. Logo o foco de teclado não é visualmente distinto do hover. Navegação por seta fica ambígua.

**Correção:** adicionar `focus-visible:ring-2 focus-visible:ring-ring` (ou um `focus-visible:bg-*` mais forte) nas opções dos autocompletes. Baixo risco, ganho de acessibilidade real.

---

## 4. Prompt combinado — usar MOTION-SPEC + este audit num novo chat

> **Contexto:** app React 18 + Vite + Tailwind v3 + framer-motion 12, tema dark, fonte Plus Jakarta Sans. Rastreador de banca de apostas (dashboard de usuário único, autenticado). Dois documentos na raiz guiam este trabalho — **leia os dois inteiros antes de tocar em qualquer arquivo**: `MOTION-SPEC.md` (linguagem de movimento) e `AUDIT-DASHBOARD.md` (achados de auditoria já filtrados para este app).
>
> **Princípios inegociáveis (valem para tudo):**
> - Trabalhar com a stack existente. Não migrar framework nem styling. Não reescrever, só melhorar o que existe.
> - Não alterar layout, dados, cópia, rotas, nomes de campo. Só movimento e a camada visual dos achados.
> - Apenas `transform`/`opacity` em animação. Zero `top/left/width/height`.
> - Nenhum pacote novo: usar o `framer-motion` já instalado.
> - **Não "consertar" falsos positivos** (§2 do audit): nada de hero, glassmorphism, inertia scroll, parallax, kinetic type. A MOTION-SPEC prevalece sobre a seção "Upgrade Techniques" de qualquer skill.
> - Testar após cada mudança. Diffs pequenos e revisáveis.
>
> **Executar nesta ordem, parando para revisão entre cada etapa:**
>
> 1. **Fundação reduced-motion (resolve audit §3.1 + spec §2):** envolver a árvore em `<MotionConfig reducedMotion="user">` (`App.tsx` ou `main.tsx`) e adicionar o kill-switch CSS `@media (prefers-reduced-motion: reduce)` da spec §2A em `src/index.css`. Criar `src/lib/motion.ts` com os tokens da spec §1. Só isso nesta etapa.
> 2. **Dashboard (spec §4):** migrar as durações/easings inline (`fadeUp`, `stagger`) para os tokens de `motion.ts`. Manter o stagger dos cards (grupo pequeno, ok). Se os KPIs animarem valor (count-up), usar `useMotionValue`/`animate`/`useTransform`, sem re-render por frame. Hover/active já existem no StatCard — não duplicar.
> 3. **Bets (audit §3.2 + spec §5):** resolver o re-disparo do stagger — trocar por fade único do contêiner OU animar só no primeiro mount (não a cada página/filtro). Confirmar que nada anima por-linha além dos ~20 paginados. Micro-pop de badge na mudança de status (Pendente → Ganha/Anulada) é permitido (feedback motivado).
> 4. **Analytics (spec §6):** animação nativa do gráfico só com `!useReducedMotion()`; cross-fade na troca de período; count-up nos números-resumo via motion value.
> 5. **A11y de foco (audit §3.3):** adicionar `focus-visible:ring-2 focus-visible:ring-ring` às opções dos autocompletes (`EventAutocomplete`, `MarketAutocomplete`, `SelectionAutocomplete`, `TipsterAutocomplete`) — foco distinto do hover.
>
> **Ao final de cada etapa:** rodar o checklist da §7 da `MOTION-SPEC.md`, reportar item a item, mostrar o diff de cada arquivo. Corrigir o que não passar antes de seguir.
