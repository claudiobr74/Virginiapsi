# Fase 11 — Twilio WhatsApp

Use `twilio-communications` e `/twilio-whatsapp`.

Implemente:
- communication_preferences;
- outbound;
- templates/configuração;
- lembrete 24h/2h;
- confirmação;
- boas-vindas;
- cobrança;
- status callbacks;
- inbound;
- confirmação/remarcação conservadora;
- idempotência;
- scheduler oficial Supabase Cron/pg_cron a cada 5 minutos → pg_net → endpoint Next.js autenticado por CRON_SECRET;
- `whatsapp_reminder_outbox` com claim atômico, retries e estados scheduled/claimed/sending/sent/retryable_failed/permanent_failed;
- `unique(appointment_id, reminder_type)` para 24h/2h;
- segredos/URL do job no Supabase Vault, sem valores em migrations.

Webhooks só processam após validação de assinatura oficial.

Gate: invalid signature, duplicate MessageSid, status transitions, consent, appointment linkage, overlapping cron executions, retry idempotency e CRON_SECRET inválido. Pare.
