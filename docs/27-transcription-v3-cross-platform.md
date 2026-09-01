# Transcrição V3 — compatibilidade de navegador e operação

Tabela preenchida só com o que esta rodada verificou. Não inventar suporte.

| Feature | Chrome Android | Safari iOS/iPadOS | Chrome Desktop | Edge Desktop | Safari macOS |
|---|---|---|---|---|---|
| getUserMedia | not verified | not verified | verified (Playwright Chromium) | not verified | not verified |
| MediaRecorder | not verified | not verified | verified (Playwright Chromium) | not verified | not verified (Playwright WebKit: API path only) |
| preferred MIME | not verified | not verified | negotiated (webm/opus when advertised) | not verified | not verified |
| IndexedDB | not verified | not verified | unit (Node) / Playwright recovery path | not verified | not verified |
| WebCrypto AES-GCM | not verified | not verified | verified (unit, Node 22) | not verified | not verified |
| Storage estimate | not verified | not verified | not verified | not verified | not verified |
| Storage persist | not verified | not verified | not verified | not verified | not verified |
| Wake Lock | not verified | not verified | not verified | not verified | not verified |
| multi-tab locking | not verified | not verified | not verified | not verified | not verified |

Firefox: não bloqueia a arquitetura; sem verificação nesta rodada.

MIME escolhido em dispositivo real: **not verified** (não inventar `audio/webm` vs `audio/mp4`).

## Data flow

**LIVE** dispositivo → VirgíniaPsi (`transcribe-chunk`) → Groq → texto no Postgres → ACK → apagar Blob.

**OFFLINE** dispositivo → IndexedDB AES-GCM → reconectar → VirgíniaPsi → Groq → texto → apagar ciphertext.

**IMPORT** arquivo no dispositivo → Storage privado temporário → Groq → texto → apagar objeto.

## Groq ZDR checklist (operacional)

1. Confirmar no console Groq se Zero Data Retention está ativo para a organização.
2. Registrar data, conta (sem chave) e evidência (screenshot interno, não no git).
3. Status neste repositório: **NOT_VERIFIED**.

Não assumir ZDR = active.

## Runbook curto

- Sem `GROQ_API_KEY`: `transcribe-chunk` e import respondem 503; Agenda/Configurações continuam.
- 429: cliente faz retry e, se persistir, spool.
- Preview ≠ produção. CI verde ≠ Android/Safari validados.

## Performance

Não inventar números. Medir em dispositivo real: start → recording; chunk → texto.