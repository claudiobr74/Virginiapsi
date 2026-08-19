---
name: deepgram-live
description: Build/test Deepgram live transcription with consent gates, temporary browser tokens, reconnect and direct-storage fallback.
---
# Deepgram Live

1. Validate user/tenant/patient and applicable recording/transcription consent before provider access.
2. If consent is invalid/revoked, do not activate microphone or request provider token; preserve session without transcription.
3. Authenticated server route grants a fresh temporary Deepgram token immediately before each connection attempt; use the 30s default TTL and consume immediately.
4. Browser opens direct WebSocket.
5. Model/language options are explicit and centrally configured.
6. Interim text is ephemeral/provisional; final segments persist with sequence/idempotency and remain clinically reviewable.
7. Track known ambiguity/quality signals when available; do not treat ASR as literal truth.
8. Every reconnect requests a new token; never reuse the previous token. Reconnect maintains continuity without duplicate final text.
9. On live failure, re-run the same recording/transcription consent gate before issuing any signed upload grant. Invalid/revoked consent denies upload capability.
10. Direct-upload audio to private Supabase Storage only with that server-issued grant; generic membership-only upload to the fallback bucket is forbidden.
11. Server receives only object path + metadata and requests prerecorded transcription by signed URL.
12. Verify no base64/full-audio request to Vercel exists.
13. Test fresh-token-on-reconnect, expired-token recovery, fallback-upload consent denial, negation ambiguity, duplicate reconnect and no emotion-recognition behavior.
