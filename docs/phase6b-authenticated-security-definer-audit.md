# Fase 6B — auditoria de SECURITY DEFINER executável por authenticated

Base auditada: `staging` após a Fase 6A (`7bb98c26b530eb9f94623436b664abf75b1c2cd3`).
Projeto Supabase: `kgfcgxagixiynlcewept`.

## Objetivo

Reduzir a superfície exposta pelo Advisor 0029 sem quebrar RLS, bootstrap, administração, Google Calendar, financeiro, documentos ou integrações. Nesta fase não haverá revogação em massa de `authenticated` e não haverá troca indiscriminada para `SECURITY INVOKER`.

## Estado observado

- O inventário inicial encontrou 41 funções em `public` como `SECURITY DEFINER` executáveis por `authenticated`.
- Todas usam `SET search_path TO ''`.
- A Fase 6A já havia removido `anon` das funções auditadas.
- O Advisor 0029 é tratado como sinal para revisão, não como ordem para revogar todas as RPCs.

## Lote implementado e validado

### `get_google_credentials(uuid)`

Foi confirmado que a leitura das credenciais Google ocorre em módulo `server-only` e pode usar o cliente administrativo. O RPC retornava material OAuth criptografado e não precisava permanecer exposto a usuários autenticados.

Alteração aplicada:

- `loadCredentials()` usa `createSupabaseAdminClient()` em módulo `server-only`;
- `get_google_credentials(uuid)` mantém `SECURITY DEFINER` e `search_path=''`;
- `EXECUTE` foi removido de `PUBLIC`, `anon` e `authenticated`;
- `EXECUTE` permanece para `service_role`;
- a função possui guard explícito para `service_role`;
- `upsert_google_credentials(...)` não foi alterada, pois continua dependente do contexto autenticado e de `auth.uid()`.

Validação:

- foundation-gate #452: `SUCCESS` no head `ff2ca6f8a4a64b7d0e84c929e48ce43f949b7ea8`;
- migration hospedada `phase6b_google_credentials_server_only` aplicada com sucesso;
- ACL hospedada confirmada: `anon=false`, `authenticated=false`, `service_role=true`;
- `SECURITY DEFINER=true`, `search_path=''` e guard `service_role` confirmados;
- smoke em transação confirmou execução via `service_role` sem expor valores de token;
- Security Advisor rerodado: o finding 0029 de `get_google_credentials` desapareceu.

## Classificação final dos restantes

### 1. Intencional — manter `authenticated` nesta atualização

Operações de produto ou RPCs com call-sites autenticados conhecidos. Não alterar sem mudança funcional dedicada:

- `accept_pending_invitations()`
- `add_platform_operator(uuid)`
- `bootstrap_organization(text,text,text,text)`
- `claim_platform_operator()`
- `disconnect_google_calendar(uuid)`
- `invite_organization_member(uuid,text,organization_role)`
- `list_assignable_psychologists(uuid)`
- `list_organization_members(uuid)`
- `organization_shell_settings(uuid)`
- `platform_bootstrap_state()`
- `set_google_cancelled_color_ids(uuid,text[])`
- `set_google_unavailable_color_ids(uuid,text[])`
- `ensure_whatsapp_templates(uuid)`
- `patient_whatsapp_allowed(uuid,uuid)`
- `upsert_google_credentials(uuid,text,timestamptz,text,text,text[])`

### 2. Helpers de autorização/RLS — manter agora, arquitetura futura

Revogar diretamente pode quebrar policies e cadeias de autorização. A alternativa futura é migração coordenada para schema privado/não exposto:

- `can_access_clinical_session(uuid,uuid)`
- `can_access_document(uuid,uuid,document_sensitivity)`
- `can_access_patient_clinical(uuid,uuid)`
- `can_access_patient_record(uuid,uuid)`
- `can_manage_org_patients(uuid)`
- `can_read_finance(uuid)`
- `can_write_finance(uuid)`
- `finance_period_is_closed(uuid,date)`
- `has_org_role(uuid,text[])`
- `is_clinical_practitioner(uuid)`
- `is_org_member(uuid)`
- `is_platform_operator()`
- `is_psychologist_admin(uuid)`
- `secretary_finance_access(uuid)`

### 3. Candidatos a hardening futuro — sem DDL nesta fase

Funções de sync, auditoria, espelhamento e fila que podem merecer boundary server-only, mas exigem mapeamento completo de call-sites e testes próprios antes de qualquer revogação:

- `delete_external_appointment_mirror(uuid,uuid)`
- `enqueue_appointment_whatsapp_reminders(uuid)`
- `link_external_appointment_patient(uuid,uuid,uuid)`
- `log_audit_event(uuid,text,text,text,jsonb)`
- `log_calendar_sync_event(uuid,calendar_sync_direction,text,uuid,jsonb,text,text)`
- `log_patient_audit_event(uuid,text,jsonb)`
- `mark_external_google_event_deleted(uuid,text,text)`
- `reconcile_unseen_google_mirrors(uuid,text,text[],timestamptz,timestamptz)`
- `sync_patient_whatsapp_outbox(uuid)`
- `update_external_appointment_mirror(uuid,uuid,timestamptz,timestamptz,text,appointment_status,text,text,uuid,consultation_modality,text)`
- `upsert_external_appointment(uuid,text,text,text,timestamptz,timestamptz,text,appointment_status,text,text)`

## Scope freeze

A Fase 6B termina no lote Google acima e na classificação dos demais RPCs. Os findings 0029 restantes não serão zerados por força nesta atualização. Nenhuma outra revogação será aplicada automaticamente.

## Fora de escopo

- mover `vector` de schema;
- leaked-password protection;
- corrigir INFO de RLS sem policy;
- índices/performance;
- refatorar helpers para schema privado;
- alterar fluxos funcionais do Google Calendar, financeiro, WhatsApp ou documentos.
