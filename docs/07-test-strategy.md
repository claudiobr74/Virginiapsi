# Estratégia de Testes

## Pirâmide

### Unit

- validações Zod;
- formatadores;
- regras financeiras;
- state machines;
- adapters com HTTP mocks estritos.

### Integration

- Supabase local/staging;
- migrations;
- RLS;
- Auth real;
- storage policies;
- route handlers com sessão válida/inválida;
- idempotência.

### E2E Playwright

- login;
- navegação;
- paciente;
- agenda;
- sessão;
- finance;
- documentos;
- roles;
- mobile viewport.

## Testes adversariais obrigatórios

### Auth real, sem JWT fake

O teste de token forjado deve atingir a função real usada por route handlers. Proibido mockar `requireAuth`/equivalente para provar segurança.

Cenários:

- sem cookie/session → 401;
- token aleatório → 401;
- JWT estruturalmente válido mas não emitido pelo Supabase → 401;
- sessão legítima → 200 quando autorizada.

### Tenant isolation

- A não lê B;
- A não escreve B;
- multi-membership seleciona corretamente B;
- role não muda tenant enforcement.

### Secretaria

Capture network response: não basta verificar que a UI esconde a aba. DTO/endpoint da Secretaria não pode conter chaves clínicas.

- requisição direta por ID de `documents`/`patient_attachments` com `sensitivity = 'clinical'` é negada por RLS, não por UI;
- listagem retornada à Secretaria não contém registro com `sensitivity = 'clinical'`, mesmo com paginação/filtro manipulado;
- tentativa de alterar `sensitivity` após criação é rejeitada pelo trigger de imutabilidade.

### Calendar

- evento external read-only;
- managed event editável;
- Meet criado via resposta real/mock contractual da API com `hangoutsMeet`;
- criação assíncrona Meet: pending → success e pending/failure/retry com novo requestId;
- duplicate request não duplica appointment/event;
- conflict handling.

### Twilio

- invalid signature 403;
- duplicate MessageSid idempotent;
- status transition validada;
- phone normalization;
- scheduler Supabase Cron chama endpoint com segredo válido; segredo inválido → 401/403 e zero side effects;
- execuções sobrepostas não duplicam reminder (`unique appointment_id + reminder_type`);
- retryable failure respeita `attempt_count/next_attempt_at` e não cria segundo outbox.

### Deepgram

- token endpoint sem auth 401;
- master key não aparece no client bundle;
- reconnect solicita token novo e não duplica segmentos;
- token expirado no handshake é recuperável e força novo token;
- consentimento revogado/ausente nega signed upload grant do fallback;
- batch fallback envia somente object path ao servidor;
- teste garante payload da route abaixo de limite definido.

### Dados/RLS adicionais

- `public_code`: 20+ inserções concorrentes na mesma organização não geram duplicidade; organizações distintas podem ter `PAC-001` independentemente; código não é reutilizado;
- `session_transcript_segments`: duplicate `(session_id, sequence)` não cria segundo final segment;
- `secretary_finance_access`: none nega tudo; view permite SELECT e nega write; manage permite operações definidas e hard DELETE continua negado;
- helpers RLS: teste de recursão, search_path hijack e execução por papel não autorizado.

## Gate por fase

Todo gate deve rodar, no mínimo:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- testes específicos da fase
- build de produção

Fases com UI crítica também rodam Playwright desktop + mobile.

Resultado padronizado:

- PASS
- FAIL
- EXTERNAL_BLOCKED (credencial/config externa pendente, com passos exatos)


## Runtime AI

Use `docs/15-runtime-ai-test-matrix.md` as a mandatory extension for Phases 6–8.

Minimum:
- schema adapter round-trip: contrato canônico → dialeto da superfície da API → validação Zod bate com o contrato de origem;
- chamada de integração real (não mock) aceita o `SUPERVISOR_SCHEMA` completo na superfície escolhida;
- structured output rejects malformed responses;
- prompt injection in transcripts/sources fails;
- consent gate blocks AI/recording/transcription when invalid;
- Session AI does not address patient or auto-commit;
- ASR ambiguity/negation does not become clinical fact without confirmation;
- trauma/abuse/child prompts remain non-suggestive;
- psychological tests are not autonomously scored/interpreted;
- Supervisor separates hypotheses/evidence/alternatives/uncertainty and can flag human-supervision needs;
- cultural/developmental/neurodiversity context is not pathologized;
- Knowledge is library-only by default;
- source roles are not treated as equivalent evidence by default;
- efficacy/safety claims require compatible evidence or return partial/insufficient;
- citations are restricted to retrieved source IDs;
- Apply-to-Case requires explicit opt-in and minimized context;
- cross-tenant retrieval is rejected/empty.
