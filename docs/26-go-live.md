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

### 2.1 Evidência MCP (2026-08-25, após autenticação)

MCP **Supabase** e **Vercel**: `namespaceStatus: ready`. Nenhum valor de chave/token foi gravado neste documento.

#### Supabase org `Macedotech Org`

| Projeto (nome dashboard) | Ref | Região | Postgres | Papel para este repo |
|---|---|---|---|---|
| **Tesseli** | `kgfcgxagixiynlcewept` | **us-east-1** | 17.6 | Schema Tesseli (`organizations`, RLS). Candidato a **produção** deste código. |
| **Serenita** | `bsaoujbfanluzggjvhfa` | **us-west-2** | 17.6 | Schema **outro** (`clinics` / `clinic_id`, convites, prontuário por seção). **Não** é staging deste Git. |

URLs API (não são secrets): `https://kgfcgxagixiynlcewept.supabase.co` e `https://bsaoujbfanluzggjvhfa.supabase.co`.

**Tesseli (`kgfcgxagixiynlcewept`):** tabelas públicas alinhadas ao Git (tenancy, pacientes, agenda, sessão, financeiro, WhatsApp, exports); RLS ligado. Há dados: 2 organizações, 2 membros, 89 appointments, 2 conexões Google. `list_migrations` do MCP voltou **vazio** (schema provavelmente aplicado via SQL Editor/bundle, não via `schema_migrations`). Coluna `patients.photo_path` **ausente**. Extensões instaladas: `pg_cron` 1.6.4, `supabase_vault`, `vector`, `pgcrypto`. **`pg_net` não instalado.** Jobs `cron.job`: `tesseli-whatsapp-reminders` (`*/5`) e `tesseli-audio-retention` (`0 3 * * *`). `vault.secrets`: **nenhum nome** (`tesseli_app_url` / `tesseli_cron_secret` ausentes) — os jobs existem mas a função de invoke retorna cedo sem URL/secret.

**Serenita (`bsaoujbfanluzggjvhfa`):** 13 migrations próprias (`clinics_and_profiles` … `patient_treatment_plan`), **não** as 13 de `supabase/migrations/` deste repositório. `pg_cron` / `pg_net` / `vector` não instalados. Vault vazio. **Não usar como D2 staging do Tesseli** — modelo `clinic_id` viola `docs/03` (`organization_id`).

#### Vercel team `claudiobr74-9668s-projects` (hobby)

Um projeto: **tesseli** (`prj_20xq4mI7wu8KqGA5FfMtM6Mu3u0O`), GitHub `claudiobr74/Tesseli`. `framework` no dashboard ainda **`null`**. `live: false`. Domínios: `serena-psi-beta.vercel.app`, `tesseli-claudiobr74-9668s-projects.vercel.app`, alias Fase 13. Deploys recentes com `target: null` (Preview). Último READY: commit G0 `396b576` (PR 20). Preview VirgíniaPsi (SHA `82b2162`, PR 19): `tesseli-git-cursor-virginiaps-b1a1d1-claudiobr74-9668s-projects.vercel.app`.

### 2.2 Evidência HTTP (antes do MCP)

| Item | Resultado | Evidência |
|---|---|---|
| Decisões D1/D2/D4/D5 | **PASS** | §1 deste documento |
| GitHub | **PASS** (identidade) | `https://github.com/claudiobr74/Tesseli` (privado); homepage `https://serena-psi-beta.vercel.app` |
| Alias `serena-psi-beta` `/login` | **PASS** HTTP; **FAIL** recorte | 200, headers `nosniff`/`DENY`; title **Entrar — Tesseli**; sem VirgíniaPsi |
| CLI `supabase` neste agente | **EXTERNAL_BLOCKED** | CLI ausente; inventário feito via MCP |
| Auth Site URL / providers Google | **EXTERNAL_BLOCKED** | MCP não expõe Authentication → URL Configuration |
| Postgres local desta VM | **EXTERNAL_BLOCKED** | nada em `:5432` |

Nenhum secret foi lido nem gravado.

### 2.3 O que a G0 ainda não fechou (ops, não código)

1. **D2:** criar (ou designar) um projeto Supabase de **staging com o mesmo schema Tesseli** em região documentada — o projeto Serenita **não** serve.
2. Aplicar `photo_path` no Tesseli hospedado (G3) e passar a usar `schema_migrations` rastreadas.
3. Instalar `pg_net` no Tesseli se os jobs HTTP forem usados; provisionar Vault `tesseli_app_url` / `tesseli_cron_secret` (G4).
4. Site URL do Auth e redirects Google (G4).
5. D3 (P0/P1 visual) e G1/G2.

## 3. Mapa das fases seguintes (não iniciar)

| Fase | Conteúdo | Bloqueio atual |
|---|---|---|
| G1 | UI P0 dark / P1 timeline | D3 em aberto |
| G2 | Cadastro, convite que cria usuário, role `psychologist`, allowlist D5b, troca de clínica | Spec RBAC ainda “duas funções”; confirmar §1.1 |
| G3 | Schema hospedado staging → prod (inclui RLS D4b + convites + plataforma) | Staging Tesseli ainda inexistente; prod `kgfcgxagixiynlcewept` sem `photo_path` |
| G4 | Auth/Vault/cron **por ambiente** | G0 + D2 |
| G5 | Ataque entre clínicas **e** entre profissionais da mesma clínica (D4b) | Staging real |
| G6 | Produção com ≥2 clínicas e ≥2 profissionais | G3–G5 |
| G7 | PITR em staging + LGPD de N controladoras | G0 região; parecer humano |
| G8 | Reexecução de `docs/25` | G5–G6 |

## 4. Gate G0

| Critério | Resultado |
|---|---|
| Decisões D1=B, D2=separado, D4b, D5b escritas e sem implementação antecipada | **PASS** |
| MCP Supabase + Vercel autenticados e usáveis | **PASS** |
| Inventário HTTP público sem secrets | **PASS** |
| Projeto Tesseli identificado + região **us-east-1** | **PASS** |
| D2 staging Tesseli ≠ prod (mesmo schema) | **FAIL** — existe um segundo projeto (**Serenita**, us-west-2) com **outro** modelo de dados |
| Schema Tesseli no hospedado (tabelas/RLS) | **PASS** (presente); histórico `list_migrations` **vazio** |
| `photo_path` / Vault jobs / `pg_net` | **FAIL** no projeto Tesseli |
| Auth Site URL | **EXTERNAL_BLOCKED** (fora do MCP) |
| Código de cadastro / RLS D4b / allowlist | **não executado** (fora da G0) |

**Veredito G0: FAIL parcial / EXTERNAL_BLOCKED residual.** MCPs ok; produção Tesseli visível em us-east-1; **não** há staging Tesseli; jobs cron sem Vault/`pg_net`; Auth dashboard ainda cego. **Não avançar G1/G2** até autorização. G3 não aplica schema no Serenita.

Data da evidência MCP: 2026-08-25.
