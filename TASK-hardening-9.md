# Tarefa para o agente — aplicar hardening de grants/RLS (#9)

## Objetivo
Aplicar a migration `supabase/migrations/20260710012600_harden_business_tables_grants.sql`
ao banco Supabase do projeto **Bankroll Pro** (`cttdibubqgrpkdzhojtn`), verificar que
ela fecha a folga de segurança **sem quebrar o app**, e habilitar a proteção de senha
vazada no painel Auth.

Contexto completo em `SECURITY-AUDIT-2026-07-09.md`. Resumo: as tabelas de negócio
concedem grants amplos ao role `anon` (inócuo hoje porque a RLS bloqueia, mas
privilégio desnecessário). A migration revoga `anon`, reafirma os grants de
`authenticated`, adiciona policies de negação explícita nas tabelas só-service_role
e força RLS. É **idempotente**.

## Pré-requisitos
- MCP Supabase conectado e autorizado (projeto `cttdibubqgrpkdzhojtn`).
- A migration já existe no repo (não reescrever; revisar antes de aplicar).

## Passo 1 — Snapshot ANTES (guardar para comparar)
Rode via `execute_sql` e salve o resultado:
```sql
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('bets','bet_legs','bankroll_transactions','profiles',
                     'telegram_pending_bets','telegram_settings')
  AND grantee IN ('anon','authenticated','service_role')
GROUP BY table_name, grantee ORDER BY table_name, grantee;
```
Esperado ANTES: `anon` aparece com privilégios amplos nas 4 tabelas de negócio.

## Passo 2 — Aplicar a migration
Use a ferramenta `apply_migration` (NÃO `execute_sql` para DDL), passando o conteúdo
de `20260710012600_harden_business_tables_grants.sql`, name = `harden_business_tables_grants`.

## Passo 3 — Verificação PÓS (obrigatória)

### 3a. Grants — anon deve ter sumido das tabelas de negócio
Repita a query do Passo 1. Esperado DEPOIS: **nenhuma linha `anon`** para
bets/bet_legs/bankroll_transactions/profiles; `authenticated` mantém
SELECT/INSERT/UPDATE/DELETE; `service_role` intacto.

### 3b. Policies de negação criadas
```sql
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('telegram_pending_bets','telegram_settings');
```
Esperado: `tpb_deny_non_service` e `ts_deny_non_service`, `USING(false) WITH CHECK(false)`,
roles `{anon,authenticated}`.

### 3c. FORCE RLS ativo
```sql
SELECT relname, relforcerowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND relname IN ('bets','bet_legs','bankroll_transactions','profiles');
```
Esperado: `relforcerowsecurity = true` nas 4.

### 3d. Advisors — o alerta rls_enabled_no_policy deve sumir
Rode `get_advisors` (type: security). Esperado: `rls_enabled_no_policy` de
`telegram_pending_bets`/`telegram_settings` **não aparece mais**. O
`auth_leaked_password_protection` (WARN) ainda aparece até o Passo 5.

### 3e. TESTE FUNCIONAL — o app NÃO pode quebrar (crítico)
Este é o teste que importa. Confirme que um usuário autenticado ainda lê/escreve
os próprios dados. Rode uma query simulando a sessão do dono (substitua
`<USER_UUID>` por um user_id real — pegue de `SELECT id FROM auth.users LIMIT 1;`):
```sql
-- Simula o contexto de um usuário autenticado e confere que ele vê as próprias apostas
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"<USER_UUID>","role":"authenticated"}';
SELECT count(*) AS minhas_bets FROM public.bets;      -- deve retornar > 0 (o dono tem 1425)
RESET role;
```
Se `minhas_bets` = 0 após o hardening, **ALGO QUEBROU** — reverta (Passo 4) e reporte.
Além disso: peça ao usuário um smoke test no app real (login → ver dashboard/apostas →
criar/editar uma aposta de teste → excluir). O app usa o role `authenticated`, então
não deve haver regressão.

## Passo 4 — Rollback (se algo quebrar)
A migration não dropa dados. Para reverter os grants:
```sql
GRANT ALL ON public.bets, public.bet_legs, public.bankroll_transactions, public.profiles TO anon;
ALTER TABLE public.bets NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bet_legs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bankroll_transactions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpb_deny_non_service ON public.telegram_pending_bets;
DROP POLICY IF EXISTS ts_deny_non_service ON public.telegram_settings;
```
(Só use se o teste 3e falhar — o esperado é NÃO precisar.)

## Passo 5 — Config de painel (manual, não é migration)
Habilitar **Leaked Password Protection**: painel Supabase → Authentication →
Policies (ou Providers → Email) → ativar "Leaked password protection". Reporte ao
usuário; você não consegue fazer isto via MCP.

## Passo 6 — Registrar no HANDOFF.md
Adicionar uma entrada de sessão em `HANDOFF.md` (topo) documentando: migration aplicada,
resultado das verificações 3a–3e, se o leaked-password foi habilitado, e marcar o #9
como RESOLVIDO no backlog consolidado.

## ⚠️ Notas de ambiente (importante)
- **Bug de truncamento FUSE:** editar arquivos via file-tool que ENCURTAM o arquivo pode
  deixar NUL bytes de padding ou truncar o final. Após qualquer edit que reduza tamanho,
  confira `tail` + `wc -l` e rode `eslint` (o `tsc` não pega). Para editar arquivos
  existentes com segurança, prefira reescrever via script (python/sed) no shell.
- **Não commitar** os arquivos `vitest.config.ts.timestamp-*.mjs` da raiz (temporários).
- O `.git/index.lock` costuma travar no mount (`Operation not permitted`); o commit/push
  deve ser feito pelo usuário no PowerShell local, não pelo agente.
