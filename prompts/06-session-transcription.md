# Fase 6 — Sessão Clínica + Prontuário + Transcrição + Session AI

Pré-requisito: Fase 5.5 (Consentimentos mínimos) concluída. O `ConsentState` usado nesta fase vem de `consents` real; não mockar.

Provider de transcrição: **Groq ao vivo**, com spool criptografado e importação. Leia `docs/22-transcription-provider-decision.md` e `docs/27-transcription-v3-cross-platform.md`. Deepgram e ASR local (ONNX/WebGPU/WASM) não fazem parte da arquitetura de produção.

Use `transcription`, `clinical-ai`, `/local-transcription`, `/runtime-ai-prompt-gate` e o verifier.

Antes de implementar, leia:
- `RUNTIME_AI_PROMPTS.md`
- `docs/14-runtime-ai-architecture.md`
- `docs/15-runtime-ai-test-matrix.md`
- `docs/16-runtime-ai-data-contracts.md`
- `docs/17-clinical-ai-review-v1.2.md`
- `docs/22-transcription-provider-decision.md`
- `src/lib/ai/prompts/core/*`
- `src/lib/ai/prompts/session/*`
- `src/lib/ai/contracts/session.ts`

Implemente:
- modo de sessão clínica;
- DPEP;
- área de trabalho clínico separada de dados administrativos;
- consent gate server-side para IA/gravação/transcrição;
- opção de sessão sem IA/gravação sem prejuízo ao fluxo clínico;
- transcrição ao vivo: MediaRecorder → chunks ~15 s → `POST /api/session-capture/transcribe-chunk` → Groq → persistir texto → ACK;
- feature detection (MIME, IndexedDB, Web Crypto), não sniffing de navegador;
- `session_remote_transcription_grant` emitido pelo servidor **antes** de ativar o microfone;
- recusa server-side de transcrever/persistir sem grant remoto válido;
- spool AES-GCM para falha prolongada; nunca plaintext nem raw AES key no IndexedDB;
- importação de gravação externa via signed upload privado e apagamento após persistir;
- tratamento de ambiguidade/erro de ASR;
- diarização apenas quando o adapter oferecer; sem diarização, não inventar falante;
- controle de conflito por versionamento otimista (409 em escrita desatualizada);
- encerramento de sessão (clínica completed pode coexistir com transcription pending_recovery);
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

Não usar ONNX, WebGPU Whisper, Transformers.js nem download de modelo no browser.
