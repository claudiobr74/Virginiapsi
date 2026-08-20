# Revisão Técnica Pré-Implementação — v1.4

Este documento registra as correções incorporadas após `PRE_IMPLEMENTATION_AUDIT.md` (18/08/2026, verdict `READY_WITH_FIXES`). Ele não substitui os documentos canônicos: cada decisão abaixo já foi integrada à especificação correspondente.

## Status

- P0: nenhum.
- P1 da auditoria pré-implementação: corrigidos na especificação v1.4.
- P2 acionáveis nesta rodada (chaves Supabase, auditoria append-only): corrigidos.
- P2 restantes (rate limit de IA, DR/rollback, roteiro de endpoints) e P3: não bloqueiam Fase 0; endereçar nas fases correspondentes.
- Próximo gate: reexecutar `CLAUDE_PRE_IMPLEMENTATION_REVIEW_PROMPT.md`. Fase 0 exige verdict `READY` + autorização explícita do usuário.

## Correções incorporadas

### AI-P1-001 — dialeto de schema dos contratos de IA
Fixada a decisão: contratos permanecem no dialeto atual (JSON Schema com `additionalProperties`/uniões de tipo) como fonte de verdade; implementação usa adapter de schema para a superfície de API escolhida, sem editar o contrato-fonte. Validador de runtime é Zod espelhado com teste de equivalência. Spike de 1 dia com o `SUPERVISOR_SCHEMA` real adicionado à Fase 7, antes da UI. Ver `docs/06-integrations.md` §4, `docs/14-runtime-ai-architecture.md` §4, `docs/07-test-strategy.md`, `docs/08-implementation-phases.md` (Fase 7).

### AI-P1-002 — consent gate sem módulo de consentimentos na Fase 6
Criada Fase 5.5 (Consentimentos mínimos): tabela `consents` reduzida aos tipos exigidos pela sessão clínica, registro/revogação server-side, `ConsentState`, estados de menor. Fase 6 passa a ter a Fase 5.5 como pré-requisito explícito e o `ConsentState` deixa de poder ser mockado no gate de fase. TCLE completo permanece na Fase 9. Ver `docs/08-implementation-phases.md`, `prompts/06-session-deepgram.md`.

### DATA-P1-003 — Documentos e Financeiro sem campos; RLS sem coluna de classificação
Especificados os campos das dez tabelas de Documentos e Financeiro em `docs/04-data-model.md`. Adicionada `sensitivity: administrative | clinical` a `documents` e `patient_attachments`, imutável após criação, com regra de derivação por `document_kind`. Matriz de `docs/05-security-rbac-rls.md` reescrita sobre essa coluna. Testes de negação por RLS (não por UI) adicionados a `docs/07-test-strategy.md` e `docs/10-acceptance-checklist.md`.

### LGPD-P1-004 — transferência internacional, retenção e papéis em aberto
Criado `docs/19-lgpd-privacy.md`: papéis (controlador/operador/suboperadores), inventário de suboperadores com o dado que cada um recebe, retenção por classe de dado, fluxo de exclusão sobre `patients.elimination_status`, e itens marcados para validação jurídica humana — em especial o texto final do TCLE. Adicionadas a `practice_settings` as colunas de retenção (`session_audio_fallback_retention_days`, `transcript_retention_policy`, `clinical_record_minimum_retention_years`) e a `patients` as colunas de eliminação. Job de retenção de áudio adicionado à Fase 12; texto do TCLE na Fase 9 passa a referenciar o novo documento.

### Decisões de produto tomadas junto com as correções

- **Diarização Deepgram**: mantida ativa (`diarize=true`). Atribuição de falante tratada com a mesma cautela do texto transcrito — provisória, nunca fato clínico sem confirmação, discrepância sinalizada. **Superado em 20/08/2026 por `docs/22-transcription-provider-decision.md`**: com a troca do provider, diarização virou capacidade opcional e, quando ausente, nenhum falante é inventado. A cautela sobre atribuição provisória permanece válida.
- **Concorrência de edição na sessão clínica**: versionamento otimista (`clinical_sessions.version`, HTTP 409 em escrita desatualizada) substitui lock explícito nesta versão da especificação. Ver `docs/04-data-model.md`.
- **Cores da Agenda no Google Calendar**: taxonomia de 11 categorias clínicas do app legado **não** foi adotada — decisão tomada para evitar inferência clínica visível em sistema de terceiro fora do RLS. Cor no Google passa a refletir apenas `confirmationStatus` (verde = confirmada, cinza = não confirmada/cancelada), escrita em sentido único pelo SerenaPsi. Detalhamento de campo estruturado de categoria clínica (se necessário ao Supervisor) fica para especificação futura, com origem no cadastro do paciente.
- **Migração de dados do app legado**: não há prontuário ou paciente real no app legado (dados de teste/fantasia). Nenhuma rotina de migração/conversão foi especificada; `session_dpep` nasce apenas com as quatro colunas estruturadas, sem campo de compatibilidade com o formato markdown antigo.

### Correções P2 desta rodada

- **ENV-P2-005**: `.env.example` e `docs/09-env-contract.md` migrados de `SUPABASE_SERVICE_ROLE_KEY`/chave legada para `SUPABASE_SECRET_KEY` (`sb_secret_...`) e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`), com nota sobre o header `apikey` e a deprecação das chaves legadas até o fim de 2026.
- **DATA-P2-007**: `audit_events` declarado append-only em `docs/04-data-model.md`, com teste correspondente em `docs/10-acceptance-checklist.md`.

## Invariantes que não mudaram

- Runtime Clinical Prompts permanecem v1.2.0; nenhuma redação clínica foi reescrita nesta revisão.
- Contracts em `src/lib/ai/contracts/**` não foram editados — a correção AI-P1-001 é de camada de conversão/validação, não de conteúdo do contrato.
- Arquitetura continua Next.js + Supabase, Google Calendar/Meet, Twilio, Deepgram e Gemini.
- Logo oficial permanece byte-identical ao arquivo enviado.
