# Decisão de provider de transcrição — v1.7

Substitui a decisão local-first de `docs/22` v1.6 (20/08/2026). O spike ONNX/WebGPU em `docs/23-transcription-spike-results.md` permanece como registro histórico e **não** descreve o caminho de produção atual.

## 1. Decisão

**Transcrição ao vivo via Groq (`whisper-large-v3-turbo`), com backup local criptografado e importação de gravação externa.**

- **Padrão**: o navegador captura o microfone com MediaRecorder, envia chunks (~15 s) para `POST /api/session-capture/transcribe-chunk`, o servidor chama Groq e só então persiste o texto.
- **Não usar** ONNX, WebGPU, WASM Whisper, Transformers.js nem download de modelo no browser.
- **Contingência**: fila em memória → spool AES-GCM no IndexedDB → importação de arquivo. Nunca perda silenciosa.
- **Importação**: gravador externo → upload assinado em Storage privado temporário → Groq → persistir texto → apagar o objeto.

## 2. Privacidade e suboperador

O áudio da sessão **sai temporariamente** do dispositivo no caminho ao vivo (VirgíniaPsi → Groq). Groq é suboperador no inventário de `docs/19-lgpd-privacy.md`. ZDR: **NOT_VERIFIED**.

Consentimento de transcrição anterior (`minimo-2026-08`) descrevia “áudio não sai do dispositivo” e **não autoriza** este fluxo. Nova versão: `minimo-2026-09-groq` + TCLE `tcle-2026-09-v3`. Aceites antigos não são reescritos.

## 3. Consequências arquiteturais

1. `GROQ_API_KEY` e `GROQ_TRANSCRIPTION_MODEL` só no servidor, via `getGroqTranscriptionEnv()` — nunca `getServerEnv()` no caminho de transcrição, nunca `NEXT_PUBLIC_GROQ_*`.
2. O browser **nunca** chama `api.groq.com`.
3. Chunks ao vivo **não** entram no Supabase Storage. Só a importação usa `session-audio-fallback`.
4. Idempotência continua `(session_id, sequence)` — migration **NONE**.
5. Feature detection (MediaRecorder, MIME, IndexedDB, Web Crypto), não sniffing de iPad/Safari/Chrome.

## 4. Validação

- Automatizado: unit, security, Playwright Chromium desktop/mobile e WebKit no spec de transcrição.
- Dispositivos reais (Chrome Android, Safari iOS/iPadOS): **NOT_VERIFIED** até teste manual.
