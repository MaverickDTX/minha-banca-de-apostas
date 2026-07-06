# Motion Spec — Minha Banca de Apostas

Especificação de movimento para o app (dashboard de banca de apostas).
Deriva da convergência entre `emilkowalski-motion`, os princípios de performance da `gsap-performance` e a §7 da `minimalist-ui` — a camada onde essas três skills **concordam** (física de renderização), descartando a camada estética onde elas se contradizem.

**Princípio-guia:** este é um produto de dado denso, não uma landing. Movimento serve para **comunicar** (hierarquia, feedback, transição de estado), nunca para espetáculo. Na dúvida, deixe parado.

## Stack (confirmada)

- React 18.3 + Vite 5.4, Tailwind v3.4
- `framer-motion` ^12.42 (importar de `framer-motion`)
- Tema dark único, acento verde, fonte Plus Jakarta Sans
- Páginas com motion: `Dashboard.tsx`, `Bets.tsx`, `Analytics.tsx`, `Auth.tsx`, `AppLayout.tsx`

---

## 1. Tokens de movimento (fonte única da verdade)

Centralize em `src/lib/motion.ts` e importe em todo lugar. Nada de durações/easings soltos por componente ("uma linguagem de motion só").

```ts
// src/lib/motion.ts
export const EASE = {
  out:    [0.16, 1, 0.3, 1],   // reveal / entrada (expo-out)
  inOut:  [0.65, 0, 0.35, 1],  // transição de estado
} as const;

export const DUR = {
  micro:  0.16,  // hover, active, toggle  (140–200ms)
  state:  0.24,  // troca de estado / filtro (200–260ms)
  reveal: 0.38,  // entrada de conteúdo    (320–420ms)
} as const;

export const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const; // feedback tátil

export const RISE = 10;   // translateY de entrada, em px (8–12 máx)
export const STAGGER = 0.05; // 50ms entre irmãos — só grupos pequenos
```

Regras invioláveis (as três skills concordam):

- Animar **apenas `transform` e `opacity`**. Nunca `top/left/width/height/margin/padding`.
- `will-change: transform` só em elemento que está de fato animando; nunca "por precaução".
- Valores contínuos (scroll, ponteiro, count-up) via `useMotionValue`/`useTransform` — **nunca `useState`** em loop de frame.
- Distância de entrada curta: `translateY` 8–12px, `scale` 0.98–1.0.
- Limpar sempre observers/timers/animações no unmount.

---

## 2. Reduced motion — obrigatório e global (corrige a lacuna atual)

Duas camadas. Ambas.

**A) Kill-switch CSS** em `src/index.css` (pega qualquer animação, inclusive libs):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**B) Hook no framer-motion** para degradar a lógica (não só a duração):

```tsx
import { useReducedMotion } from "framer-motion";
const reduce = useReducedMotion();
// entrada: initial={reduce ? false : { opacity: 0, y: RISE }}
// count-up: se reduce, renderizar o valor final direto, sem animar
```

Regra: **todo** movimento automático, scroll-linked, count-up, loop ou stagger tem fallback estático. Feedback de hover/active pode permanecer (é curto e disparado pelo usuário).

---

## 3. Global — AppLayout & rotas

| Elemento | Movimento | Duração | Notas |
|---|---|---|---|
| Troca de rota | cross-fade de opacidade | `DUR.state` | Só opacidade. **Sem slide** — evita layout shift e sensação de lentidão entre páginas. |
| Item de nav ativo | transição de cor/underline | `DUR.micro` | `transform`/color apenas. |
| Skeletons (`skeleton.tsx`) | shimmer existente | — | Manter; garantir que o formato do skeleton bate com o layout final (KPI card, linha de aposta). |
| Toasts / dialogs (Radix) | usar as animações do shadcn | — | Já ok; não adicionar nada por cima. |

---

## 4. Dashboard (grade de KPIs — "Visão geral")

Esta é a tela onde o motion mais aparece. Também é a mais fácil de exagerar.

| Elemento | Movimento | Parâmetros | Justificativa |
|---|---|---|---|
| Entrada dos cards | fade + `translateY(RISE)`, stagger | `DUR.reveal`, `STAGGER`, `viewport once` | Só **uma vez** por sessão de página. Sequência total < ~500ms. Cap: os ~12 cards e para. |
| Números dos KPIs | count-up | 600–900ms, `EASE.out` | **Via `useMotionValue` + `animate()` + `useTransform`** para renderizar sem re-render por frame (12 KPIs × 60fps = evitar). Só no mount ou quando o valor muda. |
| Card clicável (drill-down) | hover: `translateY(-1px)` + tint de borda; active: `scale(0.98)` | `DUR.micro` / `SPRING` | Feedback tátil de que é clicável. |
| Delta / setas (`↓ R$ 555,96`) | **sem movimento** | — | Cor comunica; movimento seria ruído. |
| "Sequência atual", "5 pendentes" | **estático** | — | Não é status ao vivo; nada de pulsar. |

Não fazer: loop em card, brilho pulsante, animar a grade inteira a cada re-render de dado.

---

## 5. Bets (lista de ~1.357 registros) — a página de maior risco

Regra dura da `emilkowalski-motion`: *"Stagger only small groups. Long staggered lists make interfaces feel slow."* Sua lista tem 1.357 linhas.

| Elemento | Movimento | Parâmetros | Notas |
|---|---|---|---|
| Entrada da lista | **sem stagger por linha** | — | No máximo um fade do **contêiner** (opacity 0→1, `DUR.state`), uma vez. Linhas aparecem instantâneas. |
| Hover de linha | tint de fundo | `DUR.micro` | — |
| Mudança de status (Pendente → Ganha/Anulada) | transição de cor + micro-pop no badge (`scale 1 → 1.04 → 1`) | `DUR.state` / 180ms | Movimento **motivado**: confirma a mudança de estado. |
| Nova aposta inserida | fade-in **só na linha nova** via `AnimatePresence` + `layout` escopado | `DUR.reveal` | Não re-animar a lista toda. |
| Filtro / ordenação | reflow **instantâneo** se > 100 itens visíveis | — | `layout` animation só quando a lista filtrada for curta. Em lista longa, animar reorder mata o FPS. |
| Lista virtualizada | **nunca** animar linha entrando | — | Se houver virtualização, entrada animada é proibida (linhas montam/desmontam ao rolar). |

---

## 6. Analytics (gráficos + filtro de período)

Gráfico é **dado**, não narrativa. Sem scroll-reveal.

| Elemento | Movimento | Parâmetros | Notas |
|---|---|---|---|
| Desenho inicial do gráfico | animação nativa da lib (Recharts `isAnimationActive`) | ~400–600ms, uma vez | Desligar sob reduced-motion (`isAnimationActive={!reduce}`). |
| Troca de período (filtro) | cross-fade / transição de dados do gráfico | `DUR.state` | Evitar remount que pisca. Sem re-desenhar do zero se der para transicionar. |
| Pills / toggles de filtro | estado ativo | `DUR.micro` | — |
| Números-resumo | count-up | igual ao Dashboard | Mesmo mecanismo `useMotionValue`. |
| Scroll-reveal em cards de gráfico | **não fazer** | — | Dado não precisa de storytelling de rolagem. |

---

## 7. Checklist de verificação (rodar antes de aceitar qualquer PR de motion)

- [ ] `prefers-reduced-motion` funciona? (DevTools → Rendering → Emulate → reduce → nada se mexe além de fades de 0.01ms)
- [ ] Nenhuma animação de `top/left/width/height` — só `transform`/`opacity`?
- [ ] Lista de Bets **não** tem stagger por linha?
- [ ] Count-up dos KPIs não dispara re-render por frame (usa motion value, não `useState`)?
- [ ] Uma easing/duração vinda de `motion.ts` — nada hard-coded solto?
- [ ] Nada de loop decorativo, custom cursor, partícula?
- [ ] Troca de rota é só fade (sem slide / sem layout shift)?
- [ ] `will-change` só onde algo anima de fato?
- [ ] Cleanup de observers/timers no unmount?

---

## 8. Prompt de teste (colar no agente de código, ex.: Claude Code / Cursor)

> **Contexto:** app React 18 + Vite + Tailwind v3 + framer-motion 12, tema dark, fonte Plus Jakarta Sans. Rastreador de banca de apostas. A spec de movimento está em `MOTION-SPEC.md` na raiz — leia-a inteira antes de tocar em qualquer arquivo.
>
> **Tarefa:** aplicar a Motion Spec, **uma etapa por vez, nesta ordem**, parando para eu revisar entre cada uma:
>
> 1. **Fundação (fazer primeiro, sozinho):** criar `src/lib/motion.ts` com os tokens da §1. Adicionar o bloco `prefers-reduced-motion` da §2A em `src/index.css`. Não mudar mais nada nesta etapa.
> 2. **Dashboard (§4):** entrada dos cards com stagger (uma vez, cap nos cards existentes) e count-up dos KPIs via `useMotionValue`/`animate`/`useTransform` (sem re-render por frame). Hover/active nos cards clicáveis. Não animar deltas nem sequência.
> 3. **Bets (§5):** garantir que a lista **não** tem stagger por linha; se tiver, remover. Adicionar só o micro-pop de badge na mudança de status e o fade da linha nova via `AnimatePresence`. Reflow de filtro instantâneo acima de 100 itens.
> 4. **Analytics (§6):** ligar a animação nativa do gráfico só quando `!useReducedMotion()`; cross-fade na troca de período; count-up nos números-resumo.
>
> **Restrições (não-negociáveis):**
> - Não alterar layout, dados, cópia, rotas, nomes de campo ou estrutura de componente. Só camada de movimento.
> - Apenas `transform`/`opacity`. Zero animação de `top/left/width/height`.
> - Todo movimento automático/count-up/stagger com fallback `useReducedMotion()`.
> - Nada de novo pacote: usar o `framer-motion` já instalado.
> - Nenhuma easing/duração hard-coded: tudo de `src/lib/motion.ts`.
>
> **Ao final de cada etapa:** rodar o checklist da §7 da spec e me dizer, item a item, o que passou. Se algum não passar, corrigir antes de seguir. Mostrar o diff de cada arquivo alterado.
