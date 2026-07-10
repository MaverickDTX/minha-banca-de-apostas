# Auditoria de segurança — grants & RLS (item #9)

**Data:** 2026-07-09
**Projeto Supabase:** Bankroll Pro (`cttdibubqgrpkdzhojtn`, região sa-east-1, Postgres 17)
**Escopo:** verificação do estado atual de grants por role e políticas RLS. **Somente leitura — nada foi alterado no banco.**

---

## Resumo executivo

O banco **não tem vazamento explorável hoje**. Toda tabela com dados do usuário tem RLS habilitado e políticas ancoradas em `auth.uid() = user_id`, sem nenhum `USING (true)`. As tabelas do bot Telegram (`telegram_pending_bets`, `telegram_settings`) são acessadas exclusivamente pelo `service_role`.

Há **uma folga de defesa-em-profundidade** (não um buraco ativo) e **dois alertas informativos** que valem endereçar quando/se o app abrir para outros usuários:

1. **Grant amplo ao `anon` nas tabelas de negócio** (`bets`, `bet_legs`, `bankroll_transactions`, `profiles`): o role anônimo tem `SELECT/INSERT/UPDATE/DELETE/TRUNCATE`. Hoje é inócuo porque a RLS bloqueia toda linha (o `anon` não tem `auth.uid()`), mas é privilégio desnecessário — deveria ser revogado.
2. **`telegram_pending_bets` e `telegram_settings` têm RLS ligado sem nenhuma policy** (advisor `rls_enabled_no_policy`, nível INFO). Isso é **intencional e seguro** (só `service_role`, que faz bypass de RLS, acessa), mas o alerta fica aberto até documentar a intenção com uma policy de negação explícita.
3. **Proteção de senha vazada desabilitada** no Auth (advisor `auth_leaked_password_protection`, WARN) — configuração do painel, não do schema.

---

## 1. Status de RLS (todas as tabelas `public`)

| Tabela | RLS habilitado | RLS forçado |
|---|---|---|
| bankroll_transactions | ✅ | ❌ |
| bet_legs | ✅ | ❌ |
| bets | ✅ | ❌ |
| profiles | ✅ | ❌ |
| telegram_links | ✅ | ❌ |
| telegram_pending_bets | ✅ | ❌ |
| telegram_settings | ✅ | ❌ |

Observação sobre `rls_forced`: está `false` em todas. Isso só importa para o **dono da tabela** (que ignora RLS); `service_role` e `authenticated` não são donos, então não muda o risco atual. Forçar RLS seria hardening extra, não correção.

---

## 2. Grants por role

### Tabelas de negócio — grant amplo ao `anon` (folga)

`bets`, `bet_legs`, `bankroll_transactions`, `profiles` concedem a **`anon`, `authenticated` e `service_role`** o conjunto completo:
`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`.

O grant a `anon` é o ponto de atenção. É o default do Supabase que **não foi restringido** para essas tabelas (ao contrário das tabelas telegram, que foram endurecidas na migration `20260707120100_telegram_tables_tighten_grants.sql`).

### Tabelas Telegram — já endurecidas (referência de bom padrão)

| Tabela | anon | authenticated | service_role |
|---|---|---|---|
| telegram_links | — (nenhum) | INSERT, SELECT, UPDATE | full |
| telegram_pending_bets | — (nenhum) | — (nenhum) | full |
| telegram_settings | — (nenhum) | — (nenhum) | full |

Este é o modelo correto: `anon` sem acesso, `authenticated` só o mínimo, `service_role` full.

---

## 3. Políticas RLS das tabelas de negócio — o que realmente protege

Todas as 4 tabelas têm as 4 operações cobertas, **todas ancoradas na identidade do dono**. Nenhuma política permissiva (`USING (true)`) encontrada.

- **bets** — `SELECT/UPDATE/DELETE USING (auth.uid() = user_id)`, `INSERT WITH CHECK (auth.uid() = user_id)`.
- **bankroll_transactions** — idem, `auth.uid() = user_id`.
- **profiles** — idem, `auth.uid() = id`.
- **bet_legs** — ancorada por herança: `EXISTS (SELECT 1 FROM bets WHERE bets.id = bet_legs.bet_id AND bets.user_id = auth.uid())`.

**Consequência:** como toda política exige `auth.uid()`, uma requisição `anon` (sem sessão) não casa com nenhuma linha. O grant amplo do item 2.1 fica neutralizado pela RLS. Por isso é folga, não vazamento.

---

## 4. Políticas das tabelas Telegram

- **telegram_links** — 3 policies `tl_*_own` (`INSERT/SELECT/UPDATE`) com `auth.uid() = user_id`. Correto: o usuário logado gerencia o próprio vínculo; o bot (service_role) faz o resto por bypass.
- **telegram_pending_bets** — **sem policy** (só service_role). Intencional.
- **telegram_settings** — **sem policy** (só service_role). Intencional.

---

## 5. Recomendações (para decisão — nenhuma aplicada)

Em ordem de relevância, **todas adiáveis enquanto o app for single-user**:

1. **Revogar grants do `anon`** nas 4 tabelas de negócio (`REVOKE ALL ON bets, bet_legs, bankroll_transactions, profiles FROM anon;`). Fecha a folga de defesa-em-profundidade. Risco baixo: o app usa sessão `authenticated`, não `anon`, então não quebra nada. **Testar** o app após aplicar.
2. **Documentar a intenção** em `telegram_pending_bets`/`telegram_settings` com uma policy de negação explícita (ex.: `CREATE POLICY deny_all ON ... FOR ALL TO anon, authenticated USING (false)`) — silencia o advisor `rls_enabled_no_policy` e torna o design explícito.
3. **Habilitar proteção de senha vazada** no painel Auth (Authentication → Policies) — 1 clique, sem migration. Só relevante com usuários de verdade.
4. **(Opcional) `FORCE ROW LEVEL SECURITY`** nas tabelas de negócio — hardening extra contra acesso via role dono.

Quando você decidir aplicar, os itens 1, 2 e 4 viram uma única migration idempotente; o item 3 é configuração de painel.

---

*Gerado a partir de inspeção ao vivo do banco via MCP Supabase. Queries de auditoria são somente-leitura (`information_schema.role_table_grants`, `pg_policies`, `pg_class`) e podem ser re-executadas a qualquer momento para reconferir.*
