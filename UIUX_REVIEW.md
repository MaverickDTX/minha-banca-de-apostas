# Avaliação UI/UX — Bankroll Pro (#23)

> **Status 2026-07-06:** itens 1–12 resolvidos em código (verificado arquivo a arquivo). Pendências restantes: teste mobile real e issues externos #14/#17 — ver backlog no fim.

Data: 2026-07-01. Método: navegação real em produção (minha-banca-de-apostas.vercel.app) via Chrome, desktop ~2294px de viewport, + análise do código JSX/Tailwind. Console limpo em todas as páginas (zero erros/warnings). Teste mobile real ficou pendente (janela do SO recusou resize); a parte mobile abaixo é análise de código.

## Veredito geral

O app está visualmente coeso e acima da média para ferramenta pessoal: dark theme consistente, cores semânticas bem aplicadas (verde/vermelho/cinza em status, lucro e gráficos), cards bem estruturados, empty states presentes, filtros avançados completos e autocomplete rápido. Os problemas graves são funcionais e de precisão de dados nos gráficos — não estéticos.

---

## P0 — Quebra funcional

### 1. Deep link / F5 → 404 do Vercel ✅ CORRIGIDO NESTA REVISÃO
Acessar qualquer rota diretamente (`/apostas`, `/analises`...) ou dar F5 fora da home retornava `404: NOT_FOUND` do Vercel. Causa: `vercel.json` em formato legado sem fallback de SPA. Fix aplicado: `{ "handle": "filesystem" }` + rewrite de tudo para `/index.html` (mantendo o build legado intacto). **Commitar e testar F5 em /apostas após o deploy.**

## P1 — Correção de informação (dados exibidos errados ou enganosos)

### 2. "Lucro líquido R$ 0,00" em apostas pendentes ✅ CORRIGIDO — pendente exibe "—" em BetCard, Bets (tabela) e Calendar
Cards e tabela mostram `R$ 0,00` para apostas pendentes. Zero significa break-even; pendente não tem resultado. Mostrar "—" quando `status === "pendente"`. Arquivos: `BetCard.tsx` (rodapé), `Bets.tsx` (coluna Lucro).

### 3. Eixo X com índices crus em "Lucro acumulado & drawdown" (Análises) ✅ CORRIGIDO — eixo `type="number"` com timestamps por dia e formato de data
O eixo mostra `17 41 66 93 121...` — índices do array, sem significado. Trocar por datas (mesmo formato dd/mm/aa dos outros gráficos). `Analytics.tsx`.

### 4. Eixo temporal categórico em "Evolução da banca" (Dashboard e Bankroll) ✅ CORRIGIDO — eixo `type="number"` + `domain=[dataMin, dataMax]`; "Resultado por mês" preenche meses vazios com 0; Bankroll trocou o gráfico por waterfall (ver item 9)
O eixo salta de 02/12/2023 para 20/06/2026 sem indicação visual de gap — a curva parece contínua mas há ~2,5 anos sem dados. Recharts com eixo categórico. Opções: (a) eixo `type="number"` com timestamps e `domain` real; (b) manter categórico mas inserir marcador visual de gap. O mesmo vale para "Resultado por mês" (2024-01 colado em 2026-06).

### 5. Histograma de odds fora de ordem (Análises) ✅ CORRIGIDO — ordem fixa das faixas via array ORDER em Analytics.tsx
Faixas exibidas em ordem de contagem: `2.10–2.99, 1.50–1.79, 3.00+, 1.80–2.09, 1.01–1.49`. Histograma pede ordem natural das faixas. Ordenar fixo: 1.01–1.49 → 1.50–1.79 → 1.80–2.09 → 2.10–2.99 → 3.00+.

### 6. Coluna "EV médio" morta (Análises) ✅ CORRIGIDO — "—" quando `evCount`/`clvCount` = 0 (metrics.ts expõe as contagens)
Toda zerada (`R$ 0,00` em todos os grupos) porque prob. estimada não é preenchida. Ocultar a coluna quando não há dados (ou exibir "—" por grupo). O mesmo critério vale para "CLV médio 0,00%" em grupos sem closing odds.

### 7. "Lucro potencial −R$ 10,00" com odd vazia (Nova aposta) ✅ CORRIGIDO — retorno/lucro exibem "—" enquanto `effectiveOdds <= 1` (BetForm.tsx)
Com o form virgem (odd vazia, stake 10), o resumo mostra lucro potencial negativo. Enquanto `odds < 1.01`, exibir "—". `BetForm.tsx` (bloco calc).

## P2 — Consistência e polimento

### 8. Idioma misto ✅ CORRIGIDO — `mapSportLabel` expandido em sportsdb.ts (Polo Aquático, Automobilismo, Hóquei na Grama, MMA etc.)
- Sidebar: "Bankroll" e "Dashboard" em EN, resto em PT ("Banca" seria consistente; "Dashboard" é aceitável como termo consagrado).
- Esportes sem tradução em Análises e no autocomplete: "Mixed Martial Arts", "Water Polo", "Motor Sport", "Field Hockey". `mapSportLabel` cobre pouco — expandir o mapa (Polo Aquático, Automobilismo, Hóquei na Grama, MMA...).

### 9. Gráfico "Evolução da banca" duplicado com estilos diferentes ✅ CORRIGIDO — Bankroll passou a mostrar waterfall "Composição da banca" (propósito diferenciado, como sugerido)
Dashboard (verde) e Bankroll (azul) mostram a mesma série com paletas diferentes. Unificar a cor ou diferenciar o propósito (ex.: Bankroll mostrar banca + transações; Dashboard só resultado).

### 10. "Lucro por esporte" (Dashboard) ✅ CORRIGIDO — esporte vazio agrupado como "—" via `getBetGroupKey`; `YAxis width={95}` para os rótulos
- Há uma segunda barra verde sem rótulo logo abaixo de "Futebol" — provável categoria vazia/null no campo sport. Investigar dado e agrupar como "Outro".
- Rótulos do eixo Y truncados ("Tênis de Mesa", "Water Polo"). Aumentar margem esquerda do gráfico ou abreviar.

### 11. Selects de filtro com label truncado (Apostas) ✅ CORRIGIDO — `w-auto min-w-[140/150px]` em Bets.tsx e Analytics.tsx
"Todos..." (esporte) e "20 por..." nas larguras fixas `w-[140px]`/`w-[150px]`. Alargar ou deixar o conteúdo definir largura mínima.

### 12. Copy menor ✅ CORRIGIDO — tabela mostra "Múltipla · N pernas" via `useBetLegCounts` (query em lote por página)
- Múltipla na tabela: "Ver detalhes ao editar" na coluna Mercado/Seleção — vago; melhor "Múltipla · N pernas" (a informação existe no card).
- Card múltipla: "+2 jogos" após o nome — bom; manter padrão também na tabela.

## Mobile (análise de código — teste real pendente)

- Sidebar shadcn/ui tem sheet mobile nativo — ok.
- Grids usam `md:` e colapsam para 1 coluna — ok.
- Vista padrão de Apostas é "cards" — boa escolha para mobile; a tabela estouraria horizontalmente.
- Riscos a verificar em dispositivo real: densidade dos 12 KPI cards do Dashboard empilhados (muito scroll), popover do autocomplete em teclado virtual, e a barra de filtros (5 controles em linha) quebrando em várias linhas.

## Acessibilidade (estático)

- Positivo: `aria-label` nos toggles de vista e nos botões de remoção de chips; hierarquia de headings correta; foco visível (ring verde) nos inputs.
- Fontes de 9–11px (`text-[9px]`–`text-[11px]`) em badges de status de perna, metadados de card e eixos — abaixo do confortável; considerar 12px mínimo onde for informação primária (status).
- Contraste: `text-muted-foreground` sobre fundo dark parece próximo do limite AA em textos pequenos — medir com ferramenta de contraste; se < 4.5:1, clarear um passo.

## Pontos fortes (manter)

Tema dark coeso com superfícies bem hierarquizadas; cores semânticas disciplinadas; logos das casas de aposta dão identidade aos cards; barra lateral limpa com ícones adequados; filtros avançados completos (tipster, tipo, ordenação, faixas, período); import/export objetivo com modelo CSV e colunas documentadas; formulário de aposta com cálculos ao vivo (prob. implícita, retorno, stake/banca) — diferencial real; autocomplete de eventos com busca em PT funcionando.

## Backlog sugerido (ordem)

1. ~~vercel.json SPA fallback~~ (feito — validar F5 em /apostas após deploy)
2. ~~Itens 2–7 (precisão de dados)~~ (feito)
3. ~~Item 8 (tradução de esportes)~~ (feito — `mapSportLabel` expandido)
4. ~~Itens 9–12 (polimento visual)~~ (feito)
5. Teste mobile real + ajustes ← **PENDENTE** (densidade dos KPIs empilhados, popover do autocomplete com teclado virtual, quebra da barra de filtros)
6. Conecta com #14 (logo/identidade) e #17 (dashboard personalizável) ← **PENDENTE** (issues externos)
