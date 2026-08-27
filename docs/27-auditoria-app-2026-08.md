# Auditoria do aplicativo VirgíniaPsi — 27 agosto 2026

**Escopo:** inspeção read-only do `main` em `bdc799b` (`docs: Google Cloud Virginiapsi e URLs OAuth (G4a)`), do schema de produção Virginiapsi (`kgfcgxagixiynlcewept`) e do alias `https://serena-psi-beta.vercel.app`. **Nenhuma correção foi implementada nesta entrega.**

**Método:** cinco especialistas read-only (arquitetura, RLS/RBAC, IA clínica, Calendar/Meet, Twilio, transcrição, UI) + verificação própria (lint, typecheck, 336 unitários, `pnpm build`, `scan:client-bundle`, SQL MCP, HTTP com chave publishable em RPCs inofensivos, curl do alias). `test:security` ficou **EXTERNAL_BLOCKED** nesta VM (sem Postgres/Docker/`psql`).

**Veredito:** a arquitetura de um Next.js + um Supabase está sólida e o produto no `main` é internamente consistente. **O app não está pronto para operação plena.** Há dois P0 confirmados (RPC de matching WhatsApp executável por `anon`; diálogo de reagendamento que desloca o horário em +offset UTC) e vários P1 em segurança, calendário, WhatsApp, IA e a11y.

---

## 1. O que está limpo

- Um único Next.js App Router; um único persistência Supabase; sem Firebase/Drive/Docs/Sheets/NotebookLM; sem Express/Nest paralelo; sem segundo ORM.
- Integrações só em `src/lib/integrations` e módulos de servidor. Zero SDK Google/Twilio/Gemini em componentes React.
- Zero `TODO`/`FIXME`/`HACK`, zero `console.log|warn|error|debug|info`, zero `: any` / `as any` em `src/`.
- 45 tabelas com RLS ligado. 120 policies de produção = 120 do Git (match 1:1). Leftovers WhatsApp das migrations de consentimento dropados.
- D4b aplicado nas tabelas clínicas de sessão, DPEP, notas, transcrição, perfil de paciente, documentos clínicos com `patient_id` e `session_notes`.
- Storage buckets `clinical-audio` e `clinical-documents` com `public=false`. Signed URL de 120s. Meet lifecycle (pending → success | failure) correto.
- Cron exige `CRON_SECRET` antes de efeito. Twilio inbound exige HMAC antes de side effect. Transcrição on-device não envia áudio. Gates de consentimento da IA falham fechados.
- Enums de segurança Session/Core/Supervisor idênticos: `none | attention | urgent_review`.
- Env: as 18 variáveis do contrato G0 são usadas. Extras só de plataforma (`VERCEL_*`, `NODE_ENV`). `scan:client-bundle` **PASS**.
- Alias HTTP: `/login` 200 título **Entrar — VirgíniaPsi**; `/signup` 200 título **Criar conta — VirgíniaPsi**; `/app` 307 → `/login`.
- `src/lib/contracts/.gitkeep` **está no Git**; a assertion do gate **não** quebra checkout limpo.
- `.cursor/rules/02-visual-identity.mdc` já aponta `public/brand/virginia-psi-mark.png` (só o título da regra ainda diz “Tesseli”).

---

## 2. P0 — corrigir antes de operar

### P0-1. `match_patients_by_whatsapp_e164` é executável por `anon`

**Prova HTTP** (chave publishable, número inexistente, sem JWT):

```
POST https://kgfcgxagixiynlcewept.supabase.co/rest/v1/rpc/match_patients_by_whatsapp_e164
→ HTTP 200 []
```

A função é `SECURITY DEFINER`, sem predicado de tenant, e o `revoke execute on all functions in schema public from public` **não remove GRANT direto** a `anon`/`authenticated` (privilégio default do projeto). Também `finance_period_is_closed` → 200 `false`. `claim_platform_operator` corretamente 401.

Hoje há **0 patients** na produção, então não houve vazamento consumado. A porta está aberta: quando existirem pacientes, um cliente anônimo consegue cruzar telefone → `patient_id` + `organization_id`.

**Correção sugerida (não feita):** `revoke execute` de `anon`/`authenticated` em todas as funções DEFINER que o app só chama via service role; predicado interno de tenant na matching; alinhar o harness `tests/security/support/supabase-emulation.sql` para emular `ALTER DEFAULT PRIVILEGES`.

### P0-2. Reagendar sessão desloca o horário em +offset UTC

`appointment-dialog.tsx` fatia `starts_at` cru (`slice(0,10)` / `slice(11,16)`). O PostgREST devolve `2026-09-18T11:00:00+00:00` = 08:00 em `America/Sao_Paulo`. `rescheduleAppointmentAction` reinterpreta via `zonedTimeToUtcIso`. Gravar (mesmo só mudando a modalidade) adianta ~3 h. Propaga para Google Calendar e para a janela dos lembretes WhatsApp.

O mesmo fatiamento UTC na agenda day/month faz sessões noturnas **sumirem** do dia civil.

**Correção sugerida (não feita):** converter `starts_at` para o timezone da org **antes** de fatiar data/hora; buckets da agenda no dia civil, não no prefixo ISO UTC.

---

## 3. P1 — segurança e Auth

| ID | Achado | Evidência |
| --- | --- | --- |
| P1-A1 | Hijack de convite se a confirmação de e-mail for desligada | `accept_pending_invitations()` casa e-mail sem `email_confirmed_at` e roda em todo `requireOrgContext()`. Signup aberto (`disable_signup: false`). **Latente** enquanto `mailer_autoconfirm = false`. |
| P1-A2 | ~82 funções `SECURITY DEFINER` com EXECUTE a `anon` | Default privileges do projeto. Sem check interno e perigosos além do P0-1: `next_patient_public_code` (incrementa contador de outra org), `finance_period_is_closed`, `patient_whatsapp_allowed`, `log_patient_audit_event` (409 se paciente inexistente). |
| P1-A3 | Harness de segurança não emula default privileges | `tests/security/support/supabase-emulation.sql` não emula `ALTER DEFAULT PRIVILEGES` de funções → testes de GRANT passam no vazio. |
| P1-A4 | Jobs WhatsApp invertem o check de membership | `enqueue_appointment_whatsapp_reminders` / `sync_patient_whatsapp_outbox`: `auth.uid() is not null` — `anon` pula membership. |
| P1-A5 | Documento clínico com `patient_id` nulo | `can_access_document` cai em `is_clinical_practitioner` da org. Laudo/relatório/atestado/encaminhamento forçam `clinical` sem exigir paciente. |
| P1-A6 | WhatsApp tables só `is_org_member` | D4b quebrado para `psychologist` não responsável: telefone, horário, existência do paciente. |
| P1-A7 | `ai_runs`/`ai_artifacts` com `patient_id IS NULL` | Visíveis a qualquer practitioner da org (já conhecido no G0). |
| P1-A8 | Tabelas sem policy mas com GRANT de tabela | `google_calendar_credentials` e `patient_code_counters`: RLS on, 0 policies; advisor aponta SELECT/INSERT de `anon`. Acesso real via DEFINER; superfície errada. |
| P1-A9 | Site URL do Supabase Auth | Continua dashboard (MCP cego). Não bloqueia login hoje, mas o reset de senha/redirects Auth dependem disso. |

---

## 4. P1 — calendário e Google

| ID | Achado |
| --- | --- |
| P1-C1 | Refresh de access token chama `upsert_google_credentials` (só admin). Secretária/psicóloga quebra após ~1 h. |
| P1-C2 | Eventos apagados no Google nunca saem do Tesseli (`showDeleted` / `syncToken` não usados). |
| P1-C3 | Cancelar/reagendar local não propaga ao Google (`deleteEvent` sem caller). |
| P1-C4 | All-day Google ancorado em `T00:00:00.000Z`. |
| P1-C5 | Agenda day/month: `starts_at.slice(0,10)` em UTC some sessões noturnas (ligado ao P0-2). |

---

## 5. P1 — Twilio / WhatsApp

| ID | Achado |
| --- | --- |
| P1-T1 | `twilio_content_sid` é lido e **nunca enviado**. `TwilioClient.send` só manda `Body` → erro 63016 fora da janela de 24 h. Lembretes 24h/2h **não disparam** em produção mesmo com cron saudável. |
| P1-T2 | Sem reaper de outbox `claimed`/`sending`. Timeout do job perde o lote. |
| P1-T3 | `From` não normalizado com `whatsapp:`. |
| P1-T4 | `normalizeE164` prefixa `+55` em 10/11 dígitos — números US corrompidos. |

Vault/`pg_net` vazios nesta VM de produção: jobs no-op silencioso (confirmado no SQL). Sem observabilidade.

---

## 6. P1 — transcrição e captura

| ID | Achado |
| --- | --- |
| P1-X1 | `/api/session-capture/upload-grant` **não** checa `GROQ_API_KEY` (o `/transcribe` checa) → áudio pode ir ao Storage com fallback “desligado”. Sem toggle de org em `practice_settings`. |
| P1-X2 | Upload-grant/transcribe sem caller no UI (só e2e). |
| P1-X3 | Purge de áudio: `DELETE storage.objects` pode não apagar o objeto no backend (LGPD — confirmar versão Supabase). |

---

## 7. P1 — IA clínica

| ID | Achado |
| --- | --- |
| P1-I1 | `buildSessionClosingContext` descarta `interventionsActuallyRecorded` / `priorPlan` / `itemsAlreadyConfirmedByClinician`. A UI chama `runSessionClosingAssist(sessionId, {})`. |
| P1-I2 | `appendClosingArtifactToDpep` / Supervisor append: artefato não amarrado a `session_id`/`patient_id` do alvo (wrong-patient write **dentro** do que o RLS já permite). |
| P1-I3 | Sem neutralização de prompt injection na Session/Supervisor; cláusula só no Knowledge. |
| P1-I4 | Supervisor sem validação de citação; `retrievedKnowledge` nunca preenchido. |
| P1-I5 | Knowledge chama o modelo com 0 chunks; `citations: []` passa. |
| P1-I6 | `schema_version` grava `RUNTIME_PROMPT_VERSION` `"1.2.0"`; contratos documentados **1.2.1**. |
| P1-I7 | `src/lib/ai/**` sem `import "server-only"`. |
| P1-I8 | Zod `.default([])` trata omissão de incerteza como “não há incerteza”. |
| P1-I9 | Apply-to-Case não persiste `consent_version`. |

---

## 8. P1 — financeiro e datas

- Fechamento/CSV usam data UTC; dashboard usa timezone da org.
- PDFs: `toLocaleDateString("pt-BR")` no servidor (Vercel UTC).
- `todayIsoDate()` sem timezone em um ponto do finance-console.

---

## 9. P1 — UI, a11y, identidade

Nenhum P0 de UI. O produto no alias já marca **VirgíniaPsi**.

- Botão `destructive`: `text-white` em `--failed` dark `#e29a92` (~2.26:1).
- Zero `loading.tsx`; `LoadingState` quase não usado.
- ~10 controles sem nome acessível; 4 tablists sem teclado.
- `LockScreen` `aria-modal` sem focus trap; o app clínico continua montado atrás.
- Mês da agenda `grid-cols-7` sem fallback mobile.
- CSV `tesseli-financeiro-….csv`.
- PNG órfão `public/brand/Logo Tesseli em Gradiente Sereno.png` (892 KB, zero refs).
- `PageHeader` vs h1 28px; 6 stat-cards; 4 tabs; 8 selects copiados.
- `/design-system` e `/setup-required` públicos (HTTP 200).

---

## 10. Git, docs e operação

- `scripts/hosted-schema.bundle.sql` (5583 linhas) parou em settings_backup; faltam 5 migrations G2/G3/photo. Fonte de verdade duplicada e obsoleta.
- ~20 PRs draft da pilha de fases ainda abertas (#2–#21 etc.) com bases antigas; `main` já contém o produto. Risco de merge errado.
- `docs/25-release-gate.md` e o inventário G0 de `docs/26` ainda dizem Tesseli / `serena-psi-beta` 404 — **desatualizados em relação ao alias atual**.
- Auth público: `disable_signup: false`, `mailer_autoconfirm: false` (confirmação ligada), Google e e-mail habilitados.

---

## 11. Gates desta auditoria

| Gate | Resultado | Evidência |
| --- | --- | --- |
| lint | **PASS** | `pnpm lint` exit 0 |
| typecheck | **PASS** | `pnpm typecheck` exit 0 |
| unitários | **PASS** | 336/336 |
| `pnpm build` | **PASS** | Next.js 16.2.0, 43 rotas |
| `scan:client-bundle` | **PASS** | nenhum secret |
| `test:security` | **EXTERNAL_BLOCKED** | sem Postgres/Docker/`psql` nesta VM |
| Playwright | **não corrido** | auditoria read-only; UI coberta por inspeção de código + HTTP do alias |
| HTTP alias `/login` | **PASS** | 200, título VirgíniaPsi |
| HTTP alias `/signup` | **PASS** | 200, título VirgíniaPsi |
| RPC `match_patients_by_whatsapp_e164` anon | **FAIL (P0)** | HTTP 200 `[]` |
| RPC `claim_platform_operator` anon | **PASS** | HTTP 401 |

---

## 12. Ordem sugerida de correção (não executar nesta entrega)

1. Revoke EXECUTE de `anon`/`authenticated` nas funções DEFINER + predicado interno em `match_patients_by_whatsapp_e164` / `next_patient_public_code`; alinhar harness de segurança.
2. Corrigir fatiamento UTC no diálogo de agenda + buckets por dia civil.
3. WhatsApp ContentSid + reaper de `claimed`/`sending`.
4. Refresh Google member-allowed; pull de cancelados; push de cancel/reschedule.
5. Amarração artefato↔sessão; fechar campos de closing; upload-grant Groq.
6. `email_confirmed_at` no accept de convites; Site URL Auth no dashboard.
7. UI: destructive dark, labels, `loading.tsx`, lock focus trap.

---

## 13. O que esta auditoria não fez

- Não aplicou SQL em Virginiapsi nem em Serenita.
- Não alterou código de produto.
- Não rodou Playwright nem o suite de segurança contra Postgres.
- Não validou Site URL do Auth (MCP cego no dashboard).
- Não enviou mensagem real Twilio / não ligou Google OAuth de ponta a ponta nesta passagem.
