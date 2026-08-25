# Go-live — processo G0–G8 (multiusuário / multiclínicas)

Este documento **não** é uma Fase 14 de `docs/08-implementation-phases.md`. As Fases 0–13 do produto já existem. Aqui fecha-se o que falta para o consultório digital **VirgíniaPsi** operar com **várias pessoas e várias clínicas**, sem misturar tenants.

Arquitetura inalterada: um Next.js App Router + Supabase; RLS como autorização; login Google ≠ OAuth da Agenda; jobs `pg_cron`/`pg_net` (sem Vercel Cron); transcrição no dispositivo; prompts em `src/lib/ai/prompts/**` intocados.

Trabalho só na fase autorizada. Gate: **PASS**, **FAIL** ou **EXTERNAL_BLOCKED**.

## 1. Decisões travadas (2026-08-25)

| Id | Decisão | Valor travado |
|---|---|---|
| D1 | Nascimento da conta | **B** — cadastro no app (e-mail confirmado e/ou Google) + convite que cria pessoa se o e-mail ainda não existir. Uma conta Auth, N memberships. |
| D2 | Ambientes de dados | **Separados** — projeto Supabase de staging ≠ produção. Preview da Vercel não aponta ao Postgres de produção de N clínicas. Vault `tesseli_app_url` de produção nunca recebe URL de Preview. |
| D3 | Escopo visual imediato | **Em aberto** — G1 (P0 dark / P1 timeline) não começa até haver autorização explícita. |
| D4 | Isolamento clínico na mesma clínica | **D4b** — a psicóloga clínica só vê pacientes de quem é responsável (`responsible_psychologist_user_id`). Ver §1.1. |
| D5 | Quem cria clínica | **D5b** — só a **plataforma** autoriza criar `organizations`. Signup (D1 B) não dispara `bootstrap_organization`. |

### 1.1 Interpretação D4b (confirmar na G2, não implementada na G0)

O spec atual (`docs/00`, `docs/01`, `docs/05`) tem só `psychologist_admin` e `secretary`, e o clínico da clínica é compartilhado entre admins. D4b **quebra** isso.

Interpretação operacional proposta para a G2 (não é código ainda):

| Papel | Cadastro administrativo (`patients`) | Clínico (perfil, sessão, DPEP, transcrição, IA, docs clínicos) | Settings / equipe / criar clínica |
|---|---|---|---|
| `psychologist` (**novo**) | só pacientes em que é `responsible_psychologist_user_id` | só esses pacientes | não |
| `psychologist_admin` | todos da clínica | **todos** da clínica (atribui responsável, cobre férias, auditoria da clínica) | sim, **dentro** da clínica; **não** cria outra clínica sozinha (D5b) |
| `secretary` | todos da clínica | nenhum | não |
| Operadora da plataforma (D5b, **não existe no schema**) | nenhum dado clínico de tenant | nenhum | allowlist de quem pode `bootstrap_organization` / suspender clínica |

Se a intenção de D4b for *também* a administradora cega aos pacientes das colegas, a G2 precisa de um fluxo de atribuição/supervisão explícito — senão a clínica não tem quem distribua a carga. **Confirmar antes da G2.**

Secretaria continua sem payload clínico. Isolamento **entre** clínicas continua `organization_id` + membership; D4b é **dentro** da clínica.

### 1.2 Interpretação D5b + D1 B

- D1 B: a pessoa **existe** no Auth (cadastro ou convite com criação de usuário).
- D5b: existir no Auth **não** cria consultório. `bootstrap_organization` passa a exigir allowlist da plataforma (tabela/RPC ainda inexistentes).
- Convite **para uma clínica** é da `psychologist_admin` daquela org (equipe), não da plataforma.
- Convite **para nascer uma clínica nova** é da operadora (plataforma).

Não há hoje `platform_operators`, convite pendente, `signUp()` nem role `psychologist`. Isso é **G2 + G3**, não G0.

## 2. Fase G0 — inventário (esta entrega)

**Objetivo:** ver os ambientes reais, registrar região, travar decisões. Sem cadastro, sem RLS D4b, sem allowlist.

### 2.1 Evidência obtida nesta sessão

| Item | Resultado | Evidência |
|---|---|---|
| Decisões D1/D2/D4/D5 | **PASS** | §1 deste documento |
| MCP Supabase | **EXTERNAL_BLOCKED** | `namespaceStatus: needsAuth` |
| MCP Vercel | **EXTERNAL_BLOCKED** | `namespaceStatus: needsAuth` |
| CLI `supabase` / `.supabase` link | **EXTERNAL_BLOCKED** | CLI ausente; sem `project ref` no repo |
| Região do Postgres hospedado | **EXTERNAL_BLOCKED** | não observável; `docs/19` permanece sem região concreta |
| `schema_migrations` / Vault / `cron.job` / Auth Site URL | **EXTERNAL_BLOCKED** | dependem do dashboard/MCP |
| Staging ≠ prod (D2) | **EXTERNAL_BLOCKED** | não há dois refs conhecidos; risco de um único projeto |
| GitHub | **PASS** (identidade) | `https://github.com/claudiobr74/Tesseli` (privado); `origin` ainda aponta o nome antigo SerenaPsi; homepage `https://serena-psi-beta.vercel.app` |
| Alias produção `/login` | **PASS** HTTP; **FAIL** de recorte | `GET https://serena-psi-beta.vercel.app/login` → **200**, `nosniff`, `DENY`, sem `x-powered-by`. Title `Entrar — Tesseli`. Sem “VirgíniaPsi”. `permissions-policy`: `camera=()` (build antigo vs `camera=(self)` no `next.config.ts` atual). O 404 documentado em `docs/25` **não** se reproduziu nesta data. |
| Preview Fase 13 `/login` | **PASS** HTTP; marca antiga | `GET https://tesseli-git-cursor-fase-13-ha-153b81-claudiobr74-9668s-projects.vercel.app/login` → **200**. Title `Entrar — Tesseli`. `camera=(self)`. Timezone de edge: `iad1` (Vercel), irrelevante para região **Supabase**. |
| Branch de UI VirgíniaPsi | **PASS** (Git) | `cursor/virginiapsi-serenita-dcad` @ `82b2162` — **não** é o que o alias de produção serve |
| Postgres local desta VM | **EXTERNAL_BLOCKED** | nada escuta `:5432`; `pnpm test:security` não roda aqui |

Nenhum secret foi lido nem gravado.

### 2.2 O que a G0 **não** fechou

1. Refs e região dos projetos Supabase (prod e staging).
2. Se as 13 migrations (e `photo_path`) estão no hospedado.
3. Site URL do Auth (localhost vs HTTPS).
4. Provider Google no Auth vs cliente Calendar.
5. Secrets Vault `tesseli_app_url` / `tesseli_cron_secret`.
6. Jobs `tesseli-whatsapp-reminders` e `tesseli-audio-retention`.
7. D3 (P0/P1 visual).

Para desbloquear: autenticar MCP Supabase e Vercel no Cursor desktop **ou** colar só os refs/região (sem chaves).

## 3. Mapa das fases seguintes (não iniciar)

| Fase | Conteúdo | Bloqueio atual |
|---|---|---|
| G1 | UI P0 dark / P1 timeline | D3 em aberto |
| G2 | Cadastro, convite que cria usuário, role `psychologist`, allowlist D5b, troca de clínica | Spec RBAC ainda “duas funções”; confirmar §1.1 |
| G3 | Schema hospedado staging → prod (inclui RLS D4b + convites + plataforma) | G0 região/refs |
| G4 | Auth/Vault/cron **por ambiente** | G0 + D2 |
| G5 | Ataque entre clínicas **e** entre profissionais da mesma clínica (D4b) | Staging real |
| G6 | Produção com ≥2 clínicas e ≥2 profissionais | G3–G5 |
| G7 | PITR em staging + LGPD de N controladoras | G0 região; parecer humano |
| G8 | Reexecução de `docs/25` | G5–G6 |

## 4. Gate G0

| Critério | Resultado |
|---|---|
| Decisões D1=B, D2=separado, D4b, D5b escritas e sem implementação antecipada | **PASS** |
| Inventário HTTP público (alias + Preview) sem secrets | **PASS** |
| Dois projetos Supabase identificados | **EXTERNAL_BLOCKED** |
| Região registrada de fato em `docs/19` | **EXTERNAL_BLOCKED** (status explícito; valor ausente) |
| Código de cadastro / RLS D4b / allowlist | **não executado** (fora da G0) |

**Veredito G0: EXTERNAL_BLOCKED** para o banco e o Auth reais. **PASS** como registro de decisões e de o que os aliases HTTPS mostram. **Não avançar G1/G2** até autorização + (para G3+) refs/região.

Data da evidência HTTP: 2026-08-25.
