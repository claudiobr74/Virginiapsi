# Auditoria do aplicativo VirgíniaPsi — 27 agosto 2026

**Escopo:** inspeção do `main` em `bdc799b` + schema de produção Virginiapsi (`kgfcgxagixiynlcewept`) + alias `https://serena-psi-beta.vercel.app`. Esta revisão **implementa as correções** dos P0 e dos P1 acionáveis; o que resta é operacional (dashboard Auth, Vault/pg_net, PRs draft antigas) ou de produto (D4b em WhatsApp, documents sem paciente).

**Método:** revalidação dos achados no código, correção com testes, lint/typecheck/unitários. `test:security` permanece **EXTERNAL_BLOCKED** nesta VM (sem Postgres/Docker/`psql`) — as novas assertions de GRANT/convite/Google estão no harness para a próxima corrida com banco.

**Veredito após correção:** os dois P0 do código foram fechados neste branch. O app **ainda depende** de aplicar a migration `20260827120000_audit_security_hardening.sql` em produção e de configurar Twilio ContentSid / Site URL Auth no dashboard.

---

## 1. O que estava limpo (mantido)

- Um único Next.js App Router; um único persistência Supabase; sem Firebase/Drive/Docs/Sheets/NotebookLM; sem Express/Nest paralelo; sem segundo ORM.
- Integrações só em `src/lib/integrations` e módulos de servidor. Zero SDK Google/Twilio/Gemini em componentes React.
- Zero `TODO`/`FIXME`/`HACK`, zero `console.log|warn|error|debug|info`, zero `: any` / `as any` em `src/`.
- Storage buckets `clinical-audio` e `clinical-documents` com `public=false`. Signed URL de 120s. Meet lifecycle (pending → success | failure) correto.
- Cron exige `CRON_SECRET` antes de efeito. Twilio inbound exige HMAC antes de side effect. Transcrição on-device não envia áudio. Gates de consentimento da IA falham fechados.
- Enums de segurança Session/Core/Supervisor idênticos: `none | attention | urgent_review`.

---

## 2. P0 — corrigidos neste branch

### P0-1. `match_patients_by_whatsapp_e164` executável por `anon`

**Era verdade.** A migration original já fazia `grant … to service_role` e `revoke … from public`, mas o hosted Supabase concede EXECUTE a `anon`/`authenticated` via `ALTER DEFAULT PRIVILEGES`. `revoke from public` **não** remove o GRANT direto.

**Correção:** `supabase/migrations/20260827120000_audit_security_hardening.sql`

- `REVOKE ALL ON ALL FUNCTIONS … FROM public, anon`
- `ALTER DEFAULT PRIVILEGES` para não recriar o GRANT
- predicado interno `auth.role() = service_role` na matching (defesa em profundidade)
- revoke de `authenticated` nas RPCs só-job (`claim_due_*`, `mark_whatsapp_outbox_*`, `next_patient_public_code`, purge/retention)
- revoke de GRANT de tabela em `google_calendar_credentials` e `patient_code_counters`
- harness `tests/security/support/supabase-emulation.sql` agora emula o default privilege hosted; teste “nenhuma função public concede EXECUTE a anon”

**Produção:** a porta continua aberta **até aplicar esta migration** no projeto Virginiapsi. Hoje há 0 patients.

### P0-2. Reagendar sessão desloca +offset UTC

**Era verdade.** `appointment-dialog` e a agenda fatiavam `starts_at` cru.

**Correção:** `civilDateTimeInTimeZone` / `civilDateInTimeZone` (`src/lib/utils/timezone.ts`). Diálogo, buckets day/week/month e data de edição usam o fuso da org. Testes cobrem `2026-09-18T11:00:00+00:00` → `08:00` em `America/Sao_Paulo` e sessão noturna UTC no dia civil anterior.

---

## 3. P1 — corrigidos neste branch

| ID | Correção |
| --- | --- |
| P1-A1 | `accept_pending_invitations()` exige `email_confirmed_at`. Teste de convite não confirmado. |
| P1-A2 / A3 | Revoke em massa + harness de default privileges + teste de EXECUTE a anon. |
| P1-A4 | `enqueue` / `sync_patient_whatsapp_outbox`: anon não pula membership (`auth.uid() is null` agora nega). |
| P1-A8 | Revoke de GRANT de tabela em credentials/counters. |
| P1-C1 | Refresh Google: primeiro connect continua admin; upsert de token existente é qualquer membro. |
| P1-C2 | Pull com `showDeleted` + `mark_external_appointment_cancelled`. |
| P1-C3 | Cancel/reagendar local propaga ao Google (best-effort, não bloqueia a escrita clínica). |
| P1-C4 | All-day Google ancorado em `00:00` no timezone da org, não `T00:00:00.000Z`. |
| P1-C5 | Fechado junto com P0-2. |
| P1-T1 | `TwilioMessagingClient` envia `ContentSid` + `ContentVariables` quando o template tem SID. |
| P1-T2 | Reaper: `claimed`/`sending` com `claimed_at` > 15 min voltam a `retryable_failed`. |
| P1-T3 | `From` normalizado com `whatsapp:`. |
| P1-X1 | `/upload-grant` recusa sem `GROQ_API_KEY` (mesmo 400 do `/transcribe`). |
| P1-I1 | Closing/preparation empacotam os campos do contrato; o servidor preenche plano anterior, notas e DPEP já confirmado. |
| P1-I2 | Append DPEP/Supervisor exige `ai_runs.session_id`/`patient_id` iguais ao alvo. |
| P1-I5 | Knowledge não chama o modelo com 0 chunks. |
| P1-I6 | `prompt_version` permanece `1.2.0`; `schema_version` grava `RUNTIME_SCHEMA_VERSION` `1.2.1`. |
| P1-I7 | `import "server-only"` em `src/lib/ai/prompts`. Stub no Vitest. |
| P1-I8 | `uncertainties` no Zod **não** tem `.default([])` — omissão falha fechada. |
| P1-I9 | Apply-to-Case persiste `consent_version`. |
| UI | Destructive dark usa `text-primary-foreground`; CSV `virginiapsi-financeiro-*.csv`; `loading.tsx` em `/app` e `/session`; lock com `inert` + trap de Tab; mês da agenda com scroll horizontal. |

---

## 4. P1 — não corrigidos (motivo)

| ID | Por quê |
| --- | --- |
| P1-A5 | Documento clínico com `patient_id` nulo é o caminho de modelos org-level (laudo/atestado). Mudar exigiria decisão de produto. |
| P1-A6 | WhatsApp tables só `is_org_member` — secretária precisa ver a fila; D4b aqui é produto. |
| P1-A7 | `ai_runs`/`ai_artifacts` com `patient_id` nulo (já conhecido no G0). |
| P1-A9 | Site URL do Supabase Auth é dashboard (MCP cego). |
| P1-T4 | `normalizeE164` +55 em 10/11 dígitos é o contrato Brasil da clínica. |
| P1-X2 | Fallback Groq não tem caller no UI de propósito (on-device é o caminho). |
| P1-X3 | Purge de objeto Storage depende da versão do backend; não confirmar nesta VM. |
| P1-I3 / I4 | Neutralização extra de injection e citações do Supervisor são trabalho de runtime prompt, fora deste corte. |
| Docs 25/26 / bundle SQL / PRs draft #2–#21 | Operação/git, não runtime. |

---

## 5. Gates desta revisão

| Gate | Resultado | Evidência |
| --- | --- | --- |
| lint | **PASS** | `pnpm lint` exit 0 |
| typecheck | **PASS** | `pnpm typecheck` exit 0 |
| unitários | **PASS** | 341/341 |
| `test:security` | **EXTERNAL_BLOCKED** | sem Postgres nesta VM |
| Playwright | **não corrido** | correções cobertas por unitários + inspeção |
| HTTP alias | inalterado | migration ainda não aplicada em prod |

---

## 6. O que falta para operar

1. Aplicar `20260827120000_audit_security_hardening.sql` no projeto Virginiapsi (`kgfcgxagixiynlcewept`). **Não aplicar em Serenita.**
2. Preencher `twilio_content_sid` nos templates 24h/2h (senão o 63016 continua fora da janela).
3. Site URL do Auth no dashboard Supabase.
4. Vault/`pg_net` para o cron de lembretes deixar de ser no-op.
