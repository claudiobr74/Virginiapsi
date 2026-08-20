# Mapa de Rotas/UI sugerido

Rotas podem ser refinadas, mas a hierarquia deve permanecer estável.

- `/login`
- `/auth/recovery`
- `/app` → Meu Dia
- `/app/patients`
- `/app/patients/[patientId]`
- `/app/agenda`
- `/app/finance`
- `/app/documents`
- `/app/supervisor`
- `/app/knowledge`
- `/app/settings`
- `/session/[sessionId]` → modo foco clínico

APIs/integration boundaries sugeridos:

- `/api/integrations/google/start`
- `/api/integrations/google/callback`
- `/api/integrations/google/calendars`
- `/api/integrations/google/sync`
- `/api/session-capture/grant`
- `/api/session-capture/segment` (persiste um segmento final de transcrição; recusa sem grant válido)
- `/api/session-capture/upload-grant`
- `/api/session-capture/transcribe` (fallback server-side, via Groq)
- `/api/integrations/twilio/send`
- `/api/webhooks/twilio/status`
- `/api/webhooks/twilio/inbound`
- `/api/ai/supervisor`
- `/api/ai/knowledge/query`

Nomes finais podem mudar, mas não criar múltiplos aliases ou endpoints redundantes para a mesma operação.
