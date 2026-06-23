## Ajustes no formulário de aposta

### 1. Campo "Seleção" travado após escolha
Hoje o `SelectionAutocomplete` envolve o `Input` em um `PopoverTrigger asChild`. Isso faz o Radix interceptar cliques/foco do input — após escolher uma sugestão, o popover fecha e clicar novamente para editar abre/fecha o popover em vez de simplesmente posicionar o cursor, dando a sensação de que o valor ficou "permanente".

Correção:
- Remover o `PopoverTrigger` em volta do `Input`. Renderizar o `Input` solto e usar um `PopoverAnchor` invisível ancorado ao mesmo container (mesmo padrão usado em `EventAutocomplete`).
- Controlar `open` manualmente: abrir em `onFocus`/`onChange`, fechar em `onBlur` (com pequeno timeout para permitir clique na sugestão) ou ao escolher um item.
- Garantir que digitar sempre filtra/reabre a lista, e que limpar o campo volta a mostrar todas as sugestões.

### 2. Autocomplete também preenche "Data da aposta"
No `applyEventPick` do `BetForm`, quando o evento escolhido tem `isoDate`:
- Continuar preenchendo `eventDate` (já funciona).
- Passar a preencher também `betDate` com o mesmo `isoDate` (data/hora do evento).

Sem mudanças em outros campos nem em lógica de cálculo.

### Arquivos afetados
- `src/components/bets/SelectionAutocomplete.tsx` — trocar `PopoverTrigger asChild` por `PopoverAnchor` + controle manual de `open`.
- `src/components/bets/BetForm.tsx` — em `applyEventPick`, setar `betDate` quando houver `isoDate`.
