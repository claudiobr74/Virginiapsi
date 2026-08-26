---
name: twilio-whatsapp
description: Implement or test Twilio WhatsApp templates, reminders, status callbacks and inbound messages.
---
# Twilio WhatsApp

1. Check communication consent/preference.
2. Normalize E.164.
3. Use template/content configuration required for the message window.
4. For 24h/2h reminders, create/claim `whatsapp_reminder_outbox` atomically; `unique(appointment_id, reminder_type)` is required before send.
5. Scheduler is Supabase Cron/pg_cron every 5 minutes calling the Next.js job endpoint via pg_net; validate CRON_SECRET before side effects.
6. Persist idempotency key before/with send transaction strategy.
7. Persist MessageSid/status and outbox state (`sent|retryable_failed|permanent_failed`) with retry metadata.
8. Validate Twilio webhook signature before any side effect.
9. Deduplicate callbacks/inbound.
10. Keep logs minimal.
11. Add provider-contract, overlapping-job/idempotency, retry, and invalid-signature tests.
