# Fase 6 — Sessão Clínica + Prontuário + Transcrição + Session AI

Pré-requisito: Fase 5.5 (Consentimentos mínimos) concluída. O `ConsentState` usado nesta fase vem de `consents` real; não mockar.

Use `deepgram-transcription`, `clinical-ai`, `/deepgram-live`, `/runtime-ai-prompt-gate` e o verifier.

Antes de implementar, leia:
- `RUNTIME_AI_PROMPTS.md`
- `docs/14-runtime-ai-architecture.md`
- `docs/15-runtime-ai-test-matrix.md`
- `docs/16-runtime-ai-data-contracts.md`
- `docs/17-clinical-ai-review-v1.2.md`
- `src/lib/ai/prompts/core/*`
- `src/lib/ai/prompts/session/*`
- `src/lib/ai/contracts/session.ts`

Implemente:
- modo de sessão clínica;
- DPEP;
- área de trabalho clínico separada de dados administrativos;
- consent gate server-side para IA/gravação/transcrição;
- opção de sessão sem IA/gravação sem prejuízo ao fluxo clínico;
- Deepgram live com `diarize=true`; rótulo de falante é provisório como o resto do texto, nunca vira fato clínico sem confirmação, discrepância de atribuição é sinalizada;
- transcrição incremental com interim explicitamente provisório;
- tratamento de ambiguidade/erro de ASR;
- controle de conflito por versionamento otimista (409 em escrita desatualizada); sem lock explícito de sessão nesta fase;
- reconexão sempre com token temporário novo solicitado imediatamente antes do novo WebSocket;
- token temporário Deepgram com TTL curto padrão (30s), usado imediatamente; não renovar durante WebSocket saudável;
- fallback por upload direto privado ao Supabase Storage **somente após novo consent gate server-side e signed upload grant**;
- encerramento de sessão;
- Session AI com três operações:
  1. apoio ao vivo seletivo;
  2. preparação de próxima sessão;
  3. fechamento/pós-sessão;
- chamadas de IA server-side;
- structured output validado;
- review explícito antes de salvar rascunho DPEP;
- `PROCEDIMENTOS` baseado prioritariamente em intervenções confirmadas como realizadas;
- nenhuma interação direta IA → paciente;
- nenhum auto-commit;
- nenhum emotion recognition por voz/face;
- nenhum scoring/interpretação autônoma de testes psicológicos.

Não altere os textos em `src/lib/ai/prompts/**` para "melhorar" a saída durante a implementação. Mudanças de prompt são decisão de produto.

Gate:
- authorization + tenant;
- consent gate real para token live **e** capability de upload fallback;
- fresh-token-on-reconnect + expired-token recovery;
- privacy;
- payload;
- transcript ambiguity/negation;
- prompt injection;
- malformed output;
- risk-label behavior;
- trauma/suggestive-question behavior;
- no restricted-test interpretation;
- no auto-commit;
- DPEP procedure confirmation;
- `/runtime-ai-prompt-gate`;
- verifier.

Pare após o gate.
