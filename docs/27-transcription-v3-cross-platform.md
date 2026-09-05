# Transcrição V3 — compatibilidade de navegador e operação

Tabela preenchida só com o que esta rodada verificou. Não inventar suporte.

| Feature | Chrome Android | Safari iOS/iPadOS | Chrome Desktop | Edge Desktop | Safari macOS |
|---|---|---|---|---|---|
| getUserMedia | not verified (emulação Playwright mobile Chromium não substitui dispositivo) | not verified | verified (Playwright Chromium desktop) | not verified | not verified |
| MediaRecorder | not verified | not verified | verified (Playwright Chromium desktop, start/stop) | not verified | not verified |
| preferred MIME | not verified | not verified | negotiated in unit tests (isTypeSupported); MIME real do MediaRecorder **not verified** | not verified | not verified |
| IndexedDB | not verified | not verified | verified (unit + Playwright offline/recovery em Chromium) | not verified | not verified |
| WebCrypto AES-GCM | not verified | not verified | verified (unit, Node 22) | not verified | not verified |
| Storage estimate | not verified | not verified | not verified | not verified | not verified |
| Storage persist | not verified | not verified | not verified | not verified | not verified |
| Wake Lock | not verified | not verified | not verified | not verified | not verified |
| multi-tab locking | not verified | not verified | not verified | not verified | not verified |

Firefox: não bloqueia a arquitetura; sem verificação nesta rodada.

MIME escolhido em dispositivo real: **not verified** (não inventar `audio/webm` vs `audio/mp4`).

Playwright WebKit (Safari desktop emulado): projeto opcional `E2E_WEBKIT=1` / `pnpm test:e2e:webkit`. Flags `--use-fake-*-media-stream` são só Chromium (WebKit recusa o argumento). Nesta VM, após instalar deps, o browser lança, mas o login E2E não preenche o campo `type=email` (valor permanece vazio; validação «Informe seu e-mail»). Caminho HTTP grant/chunk, captura, offline e import no WebKit desta rodada: **not verified**.

## Grant e spool (hardening)

- Ordem: lock → `session_remote_transcription_grant` → `getUserMedia`.
- Spool: CryptoKey non-extractable no IndexedDB. Sem raw AES key. Fail-closed: `SECURE_SPOOL_UNAVAILABLE`.
- TTL do grant: 4h (sessão ~60 min + recovery). Documentado em `docs/22` §5.

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