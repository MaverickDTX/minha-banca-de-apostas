# Prompt — Bot de Telegram para cadastro de apostas (colar num chat novo)

Copie tudo abaixo da linha para um chat novo com o agente de código, com o projeto aberto.

---

Você vai implementar o **cadastro de apostas via Telegram** no **Aposta Controlada** (React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Supabase com RLS por usuário). O usuário manda foto do bilhete (ou texto) para um bot; uma Supabase Edge Function lê o bilhete com LLM de visão, devolve um resumo com botões de confirmação, e só grava após o usuário confirmar.

## Contexto que você DEVE ler antes de tocar em qualquer arquivo
- `supabase/migrations/20260701150000_atomic_bet_write_rpcs.sql` — as RPCs transacionais existentes de escrita (bets + bet_legs). A nova RPC deve reusar a MESMA lógica de cálculo/validação.
- `src/hooks/useBets.ts` — o contrato `BetInput` e `BetLegInput`.
- `src/lib/calc.ts` — `computeNetProfit`, `computeGrossReturn`, enum de status (`pendente | green | red | void`).
- `src/pages/Settings.tsx` — onde entra a seção de vínculo.

## Princípios inegociáveis
- Trabalhar com a stack existente. **Nenhum pacote novo no frontend.** Na Edge Function (Deno) é permitido importar `zod` via `npm:zod`.
- Não alterar layout, rotas ou nomes de campo existentes. A única mudança de UI é a nova seção em Configurações.
- Toda escrita no banco vinda do bot passa por RPC transacional — nunca insert cru na tabela `bets`.
- Segurança: a Edge Function usa a service role key; TODA request do Telegram é verificada pelo header `X-Telegram-Bot-Api-Secret-Token`; a RPC `SECURITY DEFINER` tem `REVOKE` de `anon` e `authenticated` e `GRANT` apenas para `service_role`.
- Chaves e modelos SEMPRE em variáveis de ambiente/secrets — nada hard-coded.
- Diffs pequenos e revisáveis. Testar após cada etapa.

## Cadeia de provedores LLM (validada empiricamente — implementar nesta ordem)

| Ordem | Provedor/Modelo | Endpoint | Modo | Observação |
|---|---|---|---|---|
| 1 | Google `gemini-3.1-flash-lite` | `generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key=` | **responseSchema obrigatório** | Sem schema este modelo alucina bookmaker — NUNCA chamar sem schema. 500 req/dia free |
| 2 | Google `gemini-3.5-flash` | idem | responseSchema | 20 req/dia free |
| 3 | Google `gemma-4-26b-a4b-it` | idem | **sem** schema (não suporta) — prompt "responda somente o objeto JSON" + extrair último bloco `{...}` por regex | 1.500 req/dia free |
| 4 | OpenCode Zen `mimo-v2.5-free` | `opencode.ai/zen/v1/chat/completions` (OpenAI-compatível, `Authorization: Bearer`) | prompt + regex | opcional; só se `ZEN_API_KEY` definida |

Fallback: em erro HTTP, rate limit (429) ou falha de validação Zod, tenta o próximo da cadeia. Se todos falharem, o bot responde pedindo os dados em texto.

**Schema de resposta (para os modelos 1 e 2):**
```json
{
  "type": "object",
  "properties": {
    "event_name": { "type": "string", "nullable": true },
    "event_date": { "type": "string", "nullable": true },
    "bet_date":   { "type": "string", "nullable": true },
    "market":     { "type": "string", "nullable": true },
    "selection":  { "type": "string", "nullable": true },
    "odds":       { "type": "number" },
    "stake_amount": { "type": "number" },
    "bookmaker":  { "type": "string", "nullable": true },
    "status":     { "type": "string", "enum": ["pendente", "green", "red", "void"] }
  },
  "required": ["odds", "stake_amount", "status"]
}
```

**Prompt de extração (todos os provedores):**
> Extraia os dados deste bilhete de aposta. Regras: use null para qualquer campo NÃO VISÍVEL na imagem (não infira — em especial a casa de apostas: se o nome não estiver escrito, é null); valores monetários como número puro; datas em ISO 8601; event_date é a data do jogo mostrada no bilhete — se o ano não estiver visível, assuma a próxima ocorrência futura da data; bet_date só se o bilhete mostrar quando a aposta foi feita.

**Validação pós-LLM (Zod, na Edge Function):** `odds > 1`, `stake_amount > 0`, `status` no enum, datas parseáveis ou null. Falhou → próximo provedor; todos falharam → mensagem de erro amigável.

## Variáveis de ambiente (Supabase secrets)
```
TELEGRAM_BOT_TOKEN        # do @BotFather
TELEGRAM_WEBHOOK_SECRET   # string aleatória gerada por você (verificação do header)
GEMINI_API_KEY
ZEN_API_KEY               # opcional
```
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo runtime.

## Executar nesta ordem — PARAR para eu revisar entre cada etapa

### Etapa 1 — Migration (`supabase/migrations/<timestamp>_telegram_bot.sql`)
1. Tabela `telegram_links`:
   - `user_id uuid primary key references auth.users(id) on delete cascade`
   - `chat_id bigint unique` (null até vincular)
   - `link_code text unique`, `code_expires_at timestamptz` (código de 6 caracteres, validade 10 min)
   - `created_at timestamptz default now()`
   - RLS ligada: usuário autenticado faz select/insert/update apenas da própria linha (`auth.uid() = user_id`). Service role opera sem restrição (comportamento padrão).
2. Tabela `telegram_pending_bets` (necessária porque `callback_data` do Telegram é limitado a 64 bytes):
   - `id uuid primary key default gen_random_uuid()`
   - `chat_id bigint not null`, `payload jsonb not null` (o BetInput extraído), `created_at timestamptz default now()`
   - `expires_at timestamptz default now() + interval '1 hour'`
   - `awaiting_correction boolean not null default false` (fluxo do botão ✏️ Corrigir)
   - RLS ligada, SEM policies para anon/authenticated (só service role acessa).
3. RPC `create_bet_from_telegram(p_chat_id bigint, p_bet jsonb) returns uuid`:
   - `SECURITY DEFINER`, `set search_path = public`.
   - Resolve `user_id` via `telegram_links` por `p_chat_id`; se não achar, `raise exception 'chat não vinculado'`.
   - Reusa a lógica da RPC atômica existente (leia a migration citada e chame-a internamente com o user_id resolvido, ou replique a transação — o que for mais limpo dado o código existente). Calcula `net_profit`/`gross_return` do mesmo jeito do app.
   - `REVOKE EXECUTE ... FROM public, anon, authenticated; GRANT EXECUTE ... TO service_role;`
4. Idem uma RPC `link_telegram_chat(p_code text, p_chat_id bigint) returns boolean` (SECURITY DEFINER, só service_role): encontra `telegram_links` por `link_code` não expirado, grava `chat_id`, limpa o código, retorna true/false.

### Etapa 2 — Edge Function `supabase/functions/telegram-webhook/index.ts`
Em `supabase/config.toml`, adicionar `[functions.telegram-webhook] verify_jwt = false` (o Telegram não manda JWT; a autenticação é o secret token).

Fluxo do handler:
1. **Verificação**: rejeitar com 401 se `X-Telegram-Bot-Api-Secret-Token !== TELEGRAM_WEBHOOK_SECRET`.
2. **`/start`**: mensagem de boas-vindas com instruções (vincular no app em Configurações → mandar `/vincular CODIGO`).
3. **`/vincular <código>`**: chama `link_telegram_chat`. Sucesso → "Conta vinculada ✅"; falha → "Código inválido ou expirado".
4. **Mensagem com foto** (chat vinculado; se não vinculado, orientar):
   - `getFile` + download via `api.telegram.org/file/bot<token>/<path>` (pegar a maior resolução do array `photo`), converter para base64.
   - **Se a foto tiver `caption`**, anexar ao prompt como contexto do usuário com precedência explícita: *"O usuário informou adicionalmente: '<caption>'. Estas informações VENCEM o que estiver na imagem e preenchem campos não visíveis."* (ex.: legenda "bet365, tipster João" preenche `bookmaker` mesmo que a imagem não mostre).
   - Passar pela cadeia de provedores → Zod → normalizar para o shape do `BetInput` (status default `pendente`; `bet_date` default = agora se null).
   - Gravar em `telegram_pending_bets` e responder com resumo formatado (evento, mercado/seleção, odd, stake, casa, data — campos null exibidos como "—") + inline keyboard: `✅ Confirmar` (`callback_data: "c:<id>"`), `✏️ Corrigir` (`"e:<id>"`), `❌ Cancelar` (`"x:<id>"`).
5. **Texto livre** (não-comando, chat vinculado): mesmo fluxo, mandando o texto para o LLM (sem imagem) com o mesmo prompt/schema adaptado ("extraia desta descrição de aposta").
6. **`callback_query`**:
   - `c:<id>` → busca pending não expirado, chama `create_bet_from_telegram`, apaga o pending, edita a mensagem para "Aposta cadastrada ✅ <resumo curto>". Responder o `answerCallbackQuery` sempre.
   - `e:<id>` → marca o pending como aguardando correção (coluna `awaiting_correction boolean default false` na tabela) e responde "Envie as correções em texto (ex.: `casa: Betano, stake: 25`)". A próxima mensagem de texto daquele chat, se houver pending aguardando correção, é enviada ao LLM junto com o payload atual para mesclar (correções do usuário vencem), o pending é atualizado e o resumo reapresentado com os mesmos botões.
   - `x:<id>` → apaga o pending, edita para "Cancelado".
7. Erros: try/catch global; nunca vazar stack/chaves para o chat; logar com `console.error` (visível em `supabase functions logs`).

Organização do código: módulos separados dentro da function (`providers.ts` com a cadeia LLM, `telegram.ts` com helpers da API, `index.ts` com o roteamento). Zod via `npm:zod`.

### Etapa 3 — UI de vínculo em `src/pages/Settings.tsx`
Nova seção "Telegram" no padrão visual existente da página:
- Estado não vinculado: botão "Gerar código de vínculo" → upsert em `telegram_links` (via client Supabase normal, RLS cobre) com código aleatório de 6 chars e expiração +10 min → exibir o código grande + instrução "envie `/vincular CODIGO` para @SeuBot no Telegram".
- Estado vinculado (chat_id não nulo): exibir "Conectado ✅" + botão "Desvincular" (zera `chat_id`).
- Hook novo `src/hooks/useTelegramLink.ts` seguindo o padrão dos hooks existentes (TanStack Query + supabase client).

### Etapa 4 — Deploy e wiring (me entregar como instruções, não executar)
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy GEMINI_API_KEY=zzz
supabase db push
supabase functions deploy telegram-webhook
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## Ao final de CADA etapa
- Mostrar o diff de cada arquivo criado/alterado.
- Rodar `npm run lint && npm test` (etapas que tocam o frontend) e reportar.
- Etapa 2: incluir um teste manual documentado (payload de exemplo do Telegram via curl contra a function servida localmente com `supabase functions serve`).

## Checklist de aceite final
- [ ] Foto de bilhete → resumo correto com botões → confirmar → aposta aparece no app com net_profit certo.
- [ ] Bilhete sem casa visível → `bookmaker: null` no resumo (não pode inventar).
- [ ] Foto com legenda "bet365" → resumo com `bookmaker: bet365` (legenda vence a imagem).
- [ ] Botão ✏️ Corrigir → "stake: 25" em texto → resumo reapresentado com stake 25.
- [ ] Chat não vinculado → bot orienta a vincular, nada é gravado.
- [ ] Request sem secret token → 401.
- [ ] `authenticated` não consegue executar as RPCs novas (testar via SQL editor com role simulada).
- [ ] Derrubar a chave do provedor 1 (chave inválida) → cadeia cai para o provedor 2 e o fluxo completa.

Comece pela Etapa 1 e pare para eu revisar.
