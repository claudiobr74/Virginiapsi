# Fases de Implementação

## Gate pré-implementação — Auditoria integral

- executar `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md` em Plan Mode;
- revisar todo o projeto sem implementar;
- gerar verdict `READY`, `READY_WITH_FIXES` ou `NOT_READY`;
- corrigir P0/P1 de especificação antes de qualquer código;
- após correções, executar nova auditoria;
- iniciar Fase 0 somente com verdict `READY` e autorização explícita do usuário.

Gate: reauditoria `READY` + autorização do usuário.


## Fase 0 — Fundação do SerenaPsi

- repo Next.js vazio;
- package manager;
- lint/typecheck/test/build;
- estrutura de pastas;
- env validation;
- Supabase CLI;
- CI básica;
- nenhuma feature ainda.

Gate: build limpo e arquitetura-base validada.

## Fase 1 — Design system + shell + auth

- tokens visuais;
- UI primitives SerenaPsi — os onze componentes canônicos de `docs/02-visual-spec.md` §Biblioteca de Componentes Canônica (`PageContainer`, `PageHeader`, `SectionHeader`, `Modal`, `Drawer`, `EmptyState`, `LoadingState`, `SearchField`, `ConfirmDialog`, `StatusBadge`, `Button`), cada um cobrindo todas as variantes descritas na especificação;
- login/reset;
- shell desktop/mobile;
- dark mode;
- inactivity lock;
- páginas placeholder dos oito módulos, já consumindo os primitivos acima — nenhuma reimplementação local.

Gate: visual/E2E responsivo + os onze primitivos existem e nenhuma página placeholder contém modal/drawer/empty/loading/busca/confirmação feitos à mão.

## Fase 2 — Supabase tenancy/RBAC/RLS

- organizations/members/settings/audit;
- auth bootstrap;
- roles;
- active organization;
- adversarial auth/RLS tests;
- finance permission setting none/view/manage + helpers RLS hardened.

Gate: security PASS.

## Fase 3 — Pacientes

- patients admin;
- patient clinical profile separado;
- list/new/edit/hub;
- secretary DTO;
- audit;
- public_code atômico por organização + concurrency test.

Gate: role isolation + public_code concurrency PASS.

## Fase 4 — Google Calendar + Agenda + Meet

- OAuth separado;
- calendar selection;
- sync;
- Agenda day/week/month;
- CRUD managed events;
- external read-only;
- Meet real com hangoutsMeet e estados pending/success/failure.

Gate: integration contract + E2E.

## Fase 5 — Meu Dia

- timeline;
- próxima sessão;
- pendências;
- reminders entry points;
- Meet actions;
- tasks.

Gate: operational dashboard.

## Fase 5.5 — Consentimentos mínimos (pré-requisito da Fase 6)

Escopo reduzido e obrigatório antes de qualquer capability de captura. O restante de Documentos/TCLE (templates, PDF, editor, versionamento amplo de documentos) permanece na Fase 9.

- tabela `consents` com os tipos mínimos exigidos pela Fase 6: `ai_processing`, `session_recording`, `session_transcription`;
- registro e revogação server-side;
- resolução do `ConsentState` (`aiProcessingAllowed`, `recordingAllowed`, `transcriptionAllowed`, `consentVersion`, `consentRecordedAt`);
- estados de autorização do responsável e anuência da criança/adolescente quando aplicável (`minorGuardianAuthorizationValid`, `minorAssentRecorded`);
- consentimento inválido/ausente/revogado bloqueia emissão de qualquer capability de captura, incluindo temporary token Deepgram e signed upload grant do fallback;
- recusa não entra na formulação clínica como resistência.

Gate: consentimento ausente nega emissão de token; consentimento revogado nega também o signed upload grant do fallback; menor sem autorização/anuência exigida bloqueia gravação/transcrição.

## Fase 6 — Sessão clínica + prontuário + transcrição + Session AI

Pré-requisito: Fase 5.5 concluída — o `ConsentState` desta fase é resolvido a partir de dados reais, nunca mockado.

- clinical session;
- DPEP;
- área de trabalho clínico separada;
- consent gate + Deepgram live;
- diarização ativa (`diarize=true`), com identificação de falante tratada como provisória com a mesma cautela do texto transcrito: sujeita a erro, nunca vira fato clínico sem confirmação, e discrepância de atribuição de fala é sinalizada como tal, não corrigida silenciosamente;
- incremental transcript;
- direct-upload batch fallback somente após consent-gated signed upload grant;
- fresh Deepgram token em toda conexão/reconexão;
- controle de conflito de edição concorrente por versionamento otimista (escrita com versão desatualizada retorna 409); lock explícito de sessão fica fora do escopo desta fase — ver nota em `docs/04-data-model.md` sobre `clinical_sessions.version`;
- close session;
- IA ao vivo;
- preparação da próxima sessão;
- pós-sessão com draft DPEP;
- structured outputs e revisão humana;
- transcrição provisória/ASR ambiguity;
- sem avaliação psicológica/teste restrito autônomo.

Gate: privacy + payload + transcript + runtime AI tests + diarization-as-provisional test + optimistic-concurrency (409) test.

## Fase 7 — Supervisor IA

- spike de 1 dia antes da UI: enviar `SUPERVISOR_SCHEMA` real (não mock) ao modelo real na superfície de API escolhida, confirmar aceitação do dialeto/aninhamento conforme `docs/06-integrations.md` §4;
- Gemini/model provider server-side;
- runtime prompt oficial;
- structured outputs via adapter de schema + validador Zod fail-closed;
- patient/session context;
- hipóteses concorrentes + sustentação;
- formulação TCC/Terapia do Esquema + lentes adicionais somente quando selecionadas;
- objetivos/preferências/contexto;
- competência/supervisão humana;
- review/append workflow;
- AI audit metadata.

Gate: runtime AI + no auto-commit clinical content.

## Fase 8 — Conhecimento/RAG

- collections/sources;
- private uploads;
- text extraction pipeline;
- pgvector;
- retrieval-first;
- Perguntar/Sintetizar/Comparar/Estudar;
- library-only por padrão;
- Aplicar ao Caso explicitamente separado;
- citações validadas;
- source-role/evidence appraisal;
- eficácia/segurança exige fonte compatível;
- no NotebookLM dependency.

Gate: source attribution + prompt-injection + knowledge-boundary tests.

## Fase 9 — Documentos + TCLE

- templates;
- versions;
- PDF;
- Storage;
- consent flow (TCLE completo, sobre a base mínima já criada na Fase 5.5);
- texto do TCLE conforme `docs/19-lgpd-privacy.md` §7 — suboperadores, retenção, apoio de IA e direitos do titular; texto final exige validação jurídica humana antes de uso com paciente real;
- signatures;
- signed links.

Gate: storage isolation.

## Fase 10 — Financeiro

- charges/payments/plans/expenses;
- today/receivables/expenses/reports;
- receipts;
- closing;
- exports.

Gate: money/idempotency tests.

## Fase 11 — Twilio WhatsApp

- outbound/templates;
- Supabase Cron/pg_cron a cada 5 min → pg_net → Next.js reminder job;
- outbox com claim/retry/idempotência;
- inbound;
- status callbacks;
- confirmations;
- consent/preference.

Gate: webhook security + scheduler secret + overlapping-job/retry idempotency.

## Fase 12 — Settings, integration diagnostics, backup/export

- profile/clinic;
- appearance/security;
- team/access;
- integrations health;
- logical export versionado (organization/patient), manifest + hashes + signed download privado;
- risk zone incluindo fluxo de exclusão LGPD (`patients.elimination_status`, relatório e confirmação forte) conforme `docs/19-lgpd-privacy.md` §5;
- job de retenção do áudio de fallback (`session_audio_fallback_retention_days`), mesmo scheduler pg_cron/pg_net da Fase 11.

Gate: no secret leakage + retention job eliminates audio within configured window + elimination flow test.

## Fase 13 — Hardening + deploy Vercel

- full E2E;
- performance;
- accessibility;
- security review;
- production env;
- Vercel preview/prod;
- rollback docs.

Gate: release checklist 100% ou EXTERNAL_BLOCKED documentado.
