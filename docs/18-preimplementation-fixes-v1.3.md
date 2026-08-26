# Revisão Técnica Pré-Implementação — v1.3

Este documento registra as correções incorporadas após a primeira auditoria integral do Claude. Ele não substitui os documentos canônicos: cada decisão abaixo já foi integrada à especificação correspondente.

## Status

- P0: nenhum.
- P1 da primeira auditoria: corrigidos na especificação v1.3.
- P2 acionáveis: corrigidos/documentados na especificação v1.3.
- P3 redundância do prompt e contrato de exportação: corrigidos.
- Próximo gate: executar novamente `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`; Fase 0 exige verdict **READY** + autorização explícita do usuário.

## Correções incorporadas

### AI-001 — taxonomia de segurança
Supervisor, Session e core safety usam somente `none | attention | urgent_review`. Contrato do Supervisor corrigido; teste de igualdade de enum obrigatório.

### INT-002 — scheduler WhatsApp
Decisão: Supabase Cron/`pg_cron` a cada 5 minutos → `pg_net` → endpoint Next.js autenticado. Segredo/URL no Supabase Vault. `whatsapp_reminder_outbox` tem claim atômico, retry state machine e `unique(appointment_id, reminder_type)`. Vercel Cron não é dependência para cadência sub-diária.

### SEC-003 — consent gate no fallback de áudio
O mesmo `ConsentState` server-side é exigido antes de temporary token live e antes de qualquer signed upload capability do fallback. Bucket de fallback não aceita upload genérico apenas por membership.

### INT-005 — token Deepgram
> **Superado em 20/08/2026 por `docs/22-transcription-provider-decision.md`.** O Deepgram deixou de ser o provider de transcrição; não há mais token temporário no caminho padrão. Registro mantido como histórico da auditoria v1.3.

Manter TTL curto padrão de 30s e usar imediatamente. Cada conexão/reconexão solicita token novo; um WebSocket saudável não precisa renovar token após o handshake.

### DATA-004 — financeiro da Secretaria
`practice_settings.secretary_finance_access = none | view | manage`, default `none`, com enforcement RLS. Hard delete de fatos financeiros negado; void/cancel/estorno é auditável.

### DATA-006 — public_code
`patient_code_counters` + função/trigger transacional de incremento atômico por organização. `unique(organization_id, public_code)`, código imutável e não reutilizado.

### INT-001 — Google Meet
`conferenceSolutionKey.type="hangoutsMeet"`, `conferenceDataVersion=1`, requestId novo, estados `pending | success | failure` e re-fetch/backoff antes de persistir URL.

### SEC-002 — helpers RLS
Helpers SECURITY DEFINER usados para membership devem ser STABLE, `SET search_path=''`, schema-qualified, baseados em `auth.uid()` e com EXECUTE mínimo.

### DATA-004b — segmentos de transcrição
`unique(session_id, sequence)` para idempotência de persistência incremental/reconnect.

### AI-003 — Knowledge ingestion/retrieval
Assimetria de composição foi documentada como intencional: ingestion/retrieval não geram conclusão clínica ao usuário; evidence appraisal/boundary permanece nos modos de resposta.

### DOC-001 — prompt duplicado
Removido `prompts/PRE_IMPLEMENTATION_REVIEW.md`. A única fonte canônica é `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`.

### DOC-002 — exportação lógica
Definido pacote versionado `.zip` com manifest, dados estruturados, arquivos/hashes, escopo organization/patient, geração server-side e signed download URL privada.

## Invariantes que não mudaram

- Runtime Clinical Prompts permanecem v1.2.0; nenhuma redação clínica foi reescrita nesta revisão.
- Contracts receberam revisão técnica 1.2.1 apenas para a taxonomia de segurança.
- Logo oficial permanece byte-identical ao arquivo enviado.
- Arquitetura continua Next.js + Supabase, Google Calendar/Meet, Twilio, Deepgram e Gemini.
