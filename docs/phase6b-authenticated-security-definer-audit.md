# Fase 6B — auditoria de SECURITY DEFINER executável por authenticated

Base auditada: `staging` após a Fase 6A (`7bb98c26b530eb9f94623436b664abf75b1c2cd3`).
Projeto Supabase: `kgfcgxagixiynlcewept`.

## Objetivo

Reduzir a superfície exposta pelo Advisor 0029 sem quebrar RLS, bootstrap, administração, Google Calendar, financeiro, documentos ou integrações. Nesta fase não haverá revogação em massa de `authenticated` e não haverá troca indiscriminada para `SECURITY INVOKER`.

## Estado observado

- 41 funções em `public` são `SECURITY DEFINER` e ainda possuem `EXECUTE` para `authenticated`.
- Todas as 41 usam `SET search_path TO ''`.
- Após a Fase 6A, `anon` não executa as 18 funções previamente auditadas.
- O Advisor 0029 continua correto ao sinalizar exposição via `/rest/v1/rpc/*`.

## Classificação inicial

### A. RPCs potencialmente intencionais para cliente autenticado

Estas funções possuem autorização interna explícita e parecem representar operações de produto. Devem permanecer executáveis por `authenticated` até confirmação de uso e contrato:

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

A presença no Advisor 0029, isoladamente, não significa vulnerabilidade quando a execução por usuário autenticado é parte deliberada do contrato e a função valida identidade/role/tenant corretamente.

### B. Helpers de autorização/RLS — não revogar diretamente

Estas funções formam a malha de autorização e/ou são chamadas por outras funções/policies. Revogar `authenticated` diretamente pode quebrar consultas RLS. A estratégia preferencial a avaliar é movê-las para schema não exposto, mantendo chamadas schema-qualified e privilégios estritamente necessários.

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
- `patient_whatsapp_allowed(uuid,uuid)`
- `secretary_finance_access(uuid)`

### C. Candidatos a server-only / service_role — confirmar uso antes de revogar

Estas funções parecem apoiar sincronização, credenciais, espelhamento, auditoria ou filas. São candidatas a sair da superfície `authenticated`, mas cada uma precisa de confirmação de call-site antes de DDL:

- `delete_external_appointment_mirror(uuid,uuid)`
- `enqueue_appointment_whatsapp_reminders(uuid)`
- `ensure_whatsapp_templates(uuid)`
- `get_google_credentials(uuid)`
- `link_external_appointment_patient(uuid,uuid,uuid)`
- `log_audit_event(uuid,text,text,text,jsonb)`
- `log_calendar_sync_event(uuid,calendar_sync_direction,text,uuid,jsonb,text,text)`
- `log_patient_audit_event(uuid,text,jsonb)`
- `mark_external_google_event_deleted(uuid,text,text)`
- `reconcile_unseen_google_mirrors(uuid,text,text[],timestamptz,timestamptz)`
- `sync_patient_whatsapp_outbox(uuid)`
- `update_external_appointment_mirror(uuid,uuid,timestamptz,timestamptz,text,appointment_status,text,text,uuid,consultation_modality,text)`
- `upsert_external_appointment(uuid,text,text,text,timestamptz,timestamptz,text,appointment_status,text,text)`
- `upsert_google_credentials(uuid,text,timestamptz,text,text,text[])`

## Prioridade alta

### `get_google_credentials(uuid)`

A função retorna `access_token_encrypted`, `access_token_expires_at` e `refresh_token_encrypted` para qualquer chamador que passe na verificação de membership da organização. Mesmo criptografados, tokens OAuth são material sensível e não devem ser expostos ao cliente se o fluxo real puder permanecer server-side. Antes da alteração de grants, confirmar que nenhum componente cliente depende desse RPC; se for server-only, revogar `authenticated` e manter apenas `service_role`/owner.

### Funções de sincronização Google/espelho

`upsert_external_appointment`, `update_external_appointment_mirror`, `mark_external_google_event_deleted`, `reconcile_unseen_google_mirrors`, `delete_external_appointment_mirror` e `log_calendar_sync_event` devem ser comparadas com os call-sites de API/server actions. Se apenas o backend as chama, devem migrar para allowlist server-only.

## Estratégia proposta

1. Mapear call-sites reais das 41 funções em `staging`.
2. Criar uma allowlist explícita de RPCs legitimamente client-facing.
3. Para server-only, revogar `authenticated` e preservar `service_role`.
4. Para helpers de RLS, avaliar migração coordenada para schema privado/não exposto, sem quebrar policies.
5. Executar CI completo e testes de RLS.
6. Aplicar hosted migration somente após gate verde.
7. Rerodar Security Advisor e smoke tests autenticados.

## Não objetivos da 6B

- mover `vector` de schema;
- leaked-password protection;
- corrigir os dois INFO de RLS sem policy;
- índices/performance;
- alterar fluxos funcionais do Google Calendar, financeiro, WhatsApp ou documentos.
