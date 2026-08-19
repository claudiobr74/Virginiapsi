# Modelo de Dados — Especificação

Criar migrations SQL versionadas, normalizadas e alinhadas ao modelo de domínio definido neste documento.

## Núcleo tenancy/auth

### organizations
- id uuid pk
- name
- slug unique
- timezone
- status
- created_at / updated_at

### organization_members
- id uuid pk
- organization_id fk
- user_id = auth.users.id
- role enum/text: psychologist_admin | secretary
- active
- timestamps
- unique (organization_id, user_id)

### practice_settings
- organization_id unique
- professional_name
- subtitle
- crp
- cpf/cnpj quando aplicável
- pix
- clinic_name
- company_name
- greeting_prefix
- quote
- session_duration_minutes
- monthly_goal
- photo_path
- signature_path
- inactivity_timeout_minutes
- secretary_finance_access: none | view | manage (default `none`)
- session_audio_fallback_retention_days integer not null default 7 — prazo máximo do áudio bruto de fallback em `session-audio-fallback` antes de eliminação automática; ver `docs/19-lgpd-privacy.md`
- transcript_retention_policy: with_clinical_record | fixed_days (default `with_clinical_record`) — segmentos de transcrição seguem a retenção do prontuário por padrão; organização pode optar por prazo fixo mais curto
- transcript_retention_fixed_days integer nullable — usado somente quando `transcript_retention_policy = fixed_days`
- clinical_record_minimum_retention_years integer not null default 5 — guarda mínima do prontuário conforme norma profissional aplicável; não editável para valor menor sem override auditado

### audit_events
- organization_id
- actor_user_id
- action
- resource_type
- resource_id
- metadata jsonb minimizado
- created_at

Append-only: nenhuma policy concede UPDATE ou DELETE a qualquer papel de aplicação, incluindo `psychologist_admin`. Correção de lançamento é novo evento, nunca edição do existente.

## Pacientes

### patients
- id uuid pk interno
- organization_id
- public_code text not null, gerado server-side no banco (`PAC-001`, `PAC-002`, ...), imutável e nunca reutilizado
- preferred_name
- full_name
- birth_date
- cpf (se necessário ao fluxo)
- phone
- email
- responsibles
- modality
- status
- default_session_value numeric
- responsible_psychologist_user_id
- elimination_status: active | elimination_requested | partially_eliminated | eliminated (default `active`)
- elimination_requested_at nullable
- elimination_completed_at nullable
- elimination_retained_reason nullable — motivo/base legal do que foi mantido apesar da solicitação (ex.: guarda mínima de prontuário)
- timestamps

Dados clínicos não ficam nessa tabela administrativa.

O fluxo de exclusão LGPD de `docs/01-product-spec.md` §5 opera sobre `elimination_status`. `eliminated` não é DELETE físico da linha: campos identificadores são anonimizados por rotina server-side documentada, e o que precisa ser mantido por obrigação profissional/legal permanece com `elimination_retained_reason` preenchido. Ver `docs/19-lgpd-privacy.md`.

Constraints obrigatórias:
- `unique (organization_id, public_code)`;
- o cliente nunca calcula ou envia o próximo código como autoridade.

### patient_code_counters
- organization_id pk/fk
- last_value bigint not null default 0 check (last_value >= 0)
- updated_at

Estratégia de geração do `public_code`:
- função transacional `next_patient_public_code(org_id uuid)` (ou trigger equivalente) faz incremento atômico por organização com `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`;
- a atribuição do código ocorre na mesma transação de criação do paciente, via `BEFORE INSERT` trigger ou RPC única que incrementa o counter e insere o paciente; nunca fazer "buscar próximo código" e depois INSERT em duas chamadas separadas;
- formatar como `PAC-` + número com mínimo de 3 dígitos (`PAC-001`; após 999, `PAC-1000`);
- gaps são aceitáveis; duplicação e reutilização não são;
- `unique (organization_id, public_code)` é a barreira final contra colisões.

### patient_clinical_profile
Somente psicóloga:
- patient_id
- organization_id
- chief_complaint
- history
- therapy_goals
- schemas
- core_beliefs
- general_clinical_notes
- timestamps

## Consentimentos

### consents
- organization_id
- patient_id
- type: service_terms | psychotherapy | ai_processing | session_recording | session_transcription | whatsapp | other
- title
- version
- status: pending | accepted | revoked | expired
- accepted_at
- accepted_by
- accepted_ip ou hash/política aprovada
- signature_path/data quando aplicável
- guardian_authorization quando aplicável
- patient_assent quando aplicável
- revoked_at
- timestamps

A aplicação deve resolver um `ConsentState` server-side antes de gravação/transcrição/IA. A IA não interpreta o consentimento por texto livre.

### consent_files
PDF imutável por versão, Storage privado, sha256.

## Agenda

### appointments
- id uuid
- organization_id
- patient_id nullable
- starts_at timestamptz
- ends_at timestamptz
- status
- modality
- origin: SERENAPSI | GOOGLE_EXTERNAL
- managed_by_serenapsi bool
- sync_policy
- google_calendar_id
- google_event_id
- google_etag
- meet_url
- summary_snapshot
- sync_status
- last_synced_at
- timestamps

### calendar_sync_events / audits
Registra write intent/result sem conteúdo clínico desnecessário.

## Sessões

### clinical_sessions
- id uuid
- organization_id
- patient_id
- appointment_id nullable
- therapist_user_id
- started_at
- ended_at
- status: draft | in_progress | finalized | canceled
- finalization_idempotency_key
- version integer not null default 1
- timestamps

`version` é a chave de controle de concorrência otimista: toda escrita de conteúdo clínico (DPEP, working notes) inclui a versão lida; escrita com versão desatualizada retorna 409 e não aplica a mudança. Cobre o caso de duas abas/dispositivos editando a mesma sessão. Lock explícito (impedir segunda pessoa de sequer abrir a sessão em edição) não faz parte do escopo desta versão da especificação; se o consultório crescer para mais de uma profissional simultânea, reavaliar.

### session_dpep
- session_id unique
- organization_id
- demand
- procedures
- evolution
- plan
- version
- updated_by
- timestamps

### session_clinical_working_notes
- session_id
- organization_id
- formulation
- hypotheses
- working_observations
- updated_by
- timestamps

Área de trabalho clínico separada do DPEP e dos dados administrativos. O nome/UX não deve afirmar inacessibilidade jurídica automática; acesso e retenção seguem finalidade e normas aplicáveis.

### session_transcript_segments
- session_id
- organization_id
- sequence
- text
- is_final
- start_ms/end_ms opcional
- provider
- provider_confidence opcional
- ambiguity_flags jsonb opcional
- created_at
- unique (session_id, sequence)

`sequence` é a chave idempotente do segmento final por sessão. Reconexões devem fazer upsert seguro e nunca duplicar texto final.

### session_transcript_artifacts
- session_id
- storage_path opcional
- sha256
- provider
- duration_seconds
- language
- created_at

## IA

### ai_runs
- organization_id
- patient_id nullable
- session_id nullable
- purpose
- provider
- model
- prompt_name
- prompt_version
- schema_version
- consent_version nullable
- status
- source_ids jsonb nullable
- token/usage metadata sem prompt clínico cru quando desnecessário
- created_at

### ai_artifacts
- run_id
- organization_id
- type
- structured_content jsonb/text
- review_status
- reviewed_by
- timestamps

## Conhecimento/RAG

### knowledge_collections
### knowledge_sources
Campos de fonte devem suportar, quando disponíveis: título, autores, ano, edição, document_type, study_design_or_source_role, idioma, abordagem, população/contexto e metadados de localização.

### knowledge_documents
### knowledge_chunks
Cada chunk preserva `source_id` e localização rastreável no documento.

### knowledge_embeddings (vector)

Todas com organization_id e RLS. Arquivos privados. Dados de paciente nunca são ingeridos como fonte/chunk da biblioteca.

## Documentos

### document_templates
- id uuid pk
- organization_id fk
- name
- document_kind: laudo | relatorio | atestado | declaracao | encaminhamento | recibo | tcle | contrato | branco | outro
- default_sensitivity: administrative | clinical
- body_template text (com variáveis de paciente/profissional)
- active boolean default true
- timestamps

### documents
- id uuid pk
- organization_id fk
- patient_id fk nullable
- template_id fk nullable
- title
- document_kind (mesma enum de `document_templates`)
- **sensitivity: administrative | clinical — NOT NULL, imutável após criação**
- status: draft | issued | signed | canceled
- current_version integer not null default 1
- created_by
- issued_at nullable
- canceled_at nullable
- timestamps

`sensitivity` é a coluna de enforcement da matriz RBAC. Não existe documento sem classificação: a ausência de valor é erro, não default permissivo. Alteração de `administrative` para `clinical` (ou vice-versa) é proibida por trigger; reclassificar exige cancelar e emitir novo documento, com auditoria.

Regra de derivação: `document_kind` em `laudo | relatorio | atestado | encaminhamento` nasce obrigatoriamente `clinical`. `recibo` nasce `administrative`. `tcle | contrato | declaracao | branco | outro` aceitam ambos, com escolha explícita no ato da criação.

### document_versions
- id uuid pk
- document_id fk
- organization_id fk
- version integer not null
- body_snapshot text
- variables_snapshot jsonb
- created_by
- created_at
- unique (document_id, version)

Versão emitida é imutável. Correção gera nova versão; nunca UPDATE do corpo já emitido.

### document_files
- id uuid pk
- document_id fk
- document_version_id fk
- organization_id fk
- storage_path (bucket `clinical-documents`, path inclui `organization_id` e `patient_id` quando aplicável)
- mime_type
- byte_size
- sha256 not null
- generated_at
- unique (document_version_id)

### patient_attachments
- id uuid pk
- organization_id fk
- patient_id fk
- **sensitivity: administrative | clinical — NOT NULL, imutável**
- title
- storage_path (bucket `patient-attachments`)
- mime_type
- byte_size
- sha256
- uploaded_by
- created_at

Arquivo final imutável por versão, Storage privado, sha256.

## Financeiro

Valores em numeric(12,2), nunca float. Nenhuma tabela desta seção aceita hard DELETE; ver estados de anulação abaixo.

### financial_charges
- id uuid pk
- organization_id fk
- patient_id fk nullable
- session_id fk nullable (clinical_sessions)
- plan_id fk nullable
- origin: session | plan | subscription | administrative
- description
- amount numeric(12,2) not null check (amount >= 0)
- due_date date
- competence_date date (para relatório por competência)
- status: pending | partially_paid | paid | overdue | canceled | refunded
- canceled_at / canceled_by / cancel_reason
- idempotency_key text
- timestamps
- unique (organization_id, session_id) where session_id is not null

A unicidade por sessão impede que finalizar a mesma sessão duas vezes gere duas cobranças.

### financial_payments
- id uuid pk
- organization_id fk
- charge_id fk
- amount numeric(12,2) not null check (amount > 0)
- paid_at timestamptz
- method: pix | cash | card | transfer | courtesy | other
- notes
- voided_at / voided_by / void_reason
- registered_by
- idempotency_key text
- timestamps

Pagamento parcial é suportado: `financial_charges.status` deriva da soma de pagamentos não anulados. Estorno é `voided_at` preenchido, nunca DELETE.

### financial_expenses
- id uuid pk
- organization_id fk
- category
- supplier nullable
- description
- amount numeric(12,2) not null check (amount >= 0)
- due_date date
- paid_at timestamptz nullable
- recurrence jsonb nullable
- attachment_document_id fk nullable
- status: pending | paid | overdue | canceled
- canceled_at / canceled_by / cancel_reason
- timestamps

### financial_plans
- id uuid pk
- organization_id fk
- patient_id fk
- plan_type: prepaid_package | postpaid_package | monthly
- total_sessions integer nullable
- used_sessions integer not null default 0 check (used_sessions >= 0)
- price numeric(12,2) not null
- valid_from date / valid_until date nullable
- status: active | exhausted | expired | canceled
- timestamps

`used_sessions` nunca é escrito diretamente: deriva de `financial_plan_movements`.

### financial_plan_movements
- id uuid pk
- organization_id fk
- plan_id fk
- session_id fk nullable
- movement: consume | restore | adjust | renew
- delta integer not null
- reason (obrigatório quando `movement = adjust`)
- created_by
- created_at
- unique (plan_id, session_id) where session_id is not null and movement = 'consume'

### financial_closings
- id uuid pk
- organization_id fk
- period_start date / period_end date
- status: open | closed
- closed_at / closed_by
- totals_snapshot jsonb (recebido, faturado, despesas, resultado no momento do fechamento)
- timestamps
- unique (organization_id, period_start, period_end)

Período fechado bloqueia INSERT/UPDATE de fatos financeiros com `competence_date` dentro dele, exceto por reabertura explícita e auditada.

### Estados de anulação

Nenhum fato financeiro é apagado. A anulação é sempre um estado nomeado com autor, momento e motivo:
- cobrança: `canceled` (não devida) ou `refunded` (devolvida após pagamento);
- pagamento: `voided_at` preenchido;
- despesa: `canceled`;
- movimento de plano: compensado por movimento inverso (`restore`), nunca removido.

Regra de acesso da Secretaria:
- `practice_settings.secretary_finance_access = none`: nenhuma leitura/escrita financeira;
- `view`: SELECT somente;
- `manage`: SELECT + INSERT + UPDATE operacional;
- hard DELETE de fatos financeiros é negado para todos os perfis por padrão; cancelamento/estorno/void deve preservar histórico e auditoria.

## Comunicação

### communication_preferences
- patient_id
- whatsapp_enabled
- consent_id
- quiet hours/config opcional

### whatsapp_reminder_outbox
- id uuid pk
- organization_id
- appointment_id
- patient_id
- reminder_type: reminder_24h | reminder_2h
- scheduled_for timestamptz
- state: scheduled | claimed | sending | sent | retryable_failed | permanent_failed | canceled
- attempt_count integer default 0
- next_attempt_at timestamptz nullable
- claimed_at timestamptz nullable
- twilio_message_sid nullable
- last_error_code nullable (sem conteúdo clínico)
- sent_at nullable
- timestamps
- unique (appointment_id, reminder_type)

O outbox é a fonte de idempotência dos lembretes. Execuções sobrepostas do scheduler não podem produzir envio duplicado. Claim deve ser atômico/concorrente-safe.

### whatsapp_messages
- direction
- message_sid
- template_key
- status
- scheduled_for
- sent_at
- body redigido/minimizado conforme política
- idempotency_key

### whatsapp_inbound_messages
- message_sid unique
- from_number normalizado
- patient_id nullable
- body
- processed
- intent/status
- timestamps

## Integrações

### integration_accounts
- organization_id
- provider
- external_account_id/email
- encrypted_credentials (server encrypted)
- scopes
- expires_at
- status
- metadata segura
- timestamps

Nunca retornar `encrypted_credentials` para o browser.
