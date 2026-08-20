---
name: local-transcription
description: Build/test SerenaPsi session transcription — consent gates, on-device model, capture grants and the optional direct-storage fallback.
---
# Transcrição local

Provider decision: `docs/22-transcription-provider-decision.md`.

1. Validate user/tenant/patient and applicable recording/transcription consent before any capture.
2. If consent is invalid/revoked, do not activate the microphone and preserve the session without transcription.
3. An authenticated server route issues a short-lived `session_capture_grant` bound to organization/patient/session.
4. Load the on-device model (ONNX/WebGPU, WASM fallback) and capture audio locally. Verify in the network panel that no request carries audio.
5. Emit incremental transcript; mark the in-flight window as provisional.
6. Persist final segments with sequence/idempotency, and reject on the server any segment without a valid capture grant — that is the real enforcement point of the local path.
7. Track known ambiguity/quality signals when available; do not treat ASR as literal truth.
8. Detect device capability. When the device cannot sustain local transcription, offer the fallback explicitly or continue without transcription — never downgrade privacy silently.
9. Leave segments unlabeled when the adapter has no diarization; do not synthesize speakers.
10. For the fallback, re-run the same consent gate before issuing any signed upload grant. Invalid/revoked consent denies upload capability.
11. Direct-upload audio to private Supabase Storage only with that server-issued grant; generic membership-only upload to the fallback bucket is forbidden.
12. Server receives only object path + metadata and requests transcription by signed URL through the Groq adapter. Verify no base64/full-audio request to Vercel exists.
13. Test: consent denial for both capabilities, no-audio-egress on the local path, capture-grant enforcement at persistence, resume without duplicates, negation ambiguity, absent-diarization behavior and no emotion recognition.
