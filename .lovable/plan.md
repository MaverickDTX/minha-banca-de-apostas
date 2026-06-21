## Problema

Os números (R$ 1.010,50, 105,00%, etc.) ainda aparecem com cara de máquina de escrever porque o utilitário `font-mono` do Tailwind injeta sua própria pilha de fontes monoespaçadas (`ui-monospace, SFMono-Regular, Menlo...`) que sobrescreve a regra `.font-mono` customizada no `index.css`. O `.stat-number` usa `@apply font-mono`, então herda a fonte mono nativa do Tailwind.

## Solução

Sobrescrever o token `fontFamily.mono` do Tailwind no `tailwind.config.ts` para apontar para Inter com `tabular-nums`. Assim qualquer uso de `font-mono` (utilitário ou `@apply`) passa a renderizar em Inter sem serifa, mantendo alinhamento vertical dos dígitos.

### Mudanças

1. **`tailwind.config.ts`** — adicionar em `theme.extend`:
   ```ts
   fontFamily: {
     mono: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
     sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
   },
   ```

2. **`src/index.css`** — simplificar a regra `.font-mono, .tabular` mantendo apenas `font-variant-numeric: tabular-nums` (a família já vem do Tailwind agora), evitando conflito de cascata.

Nenhuma outra mudança de lógica, layout ou componentes.