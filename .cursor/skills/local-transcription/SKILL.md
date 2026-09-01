---
name: local-transcription
description: Build/test Tesseli session transcription — Groq live chunks, capture grants, encrypted spool and external recording import.
---
# Transcrição (Groq V3)

Provider decision: `docs/22-transcription-provider-decision.md`.

1. Validate user/tenant/patient and recording+transcription consent before capture or import. Outdated transcription consent (`minimo-2026-08`) must not authorize the live Groq path.
2. If consent is invalid/revoked, do not activate the microphone and preserve the session without transcription.
3. Issue a short-lived `session_capture_grant` bound to organization/patient/session.
4. Capture with MediaRecorder after MIME negotiation. Do not load an on-device ASR model.
5. Send independently-decodable chunks to `/api/session-capture/transcribe-chunk`. The browser never calls Groq.
6. Persist text only after Groq + DB; ACK then delete the local Blob. Lost ACK replays as `already_processed`.
7. Memory queue for transient failures; AES-GCM IndexedDB spool for prolonged failure; never silent loss.
8. Import uses a consent-gated signed upload to private temporary storage, then Groq, then delete.
9. Leave segments unlabeled without diarization. No emotion recognition.
10. Test: consent denial, no Groq key in the client bundle, grant enforcement, idempotent replay, spool encrypt/decrypt, Chromium desktop/mobile E2E.
