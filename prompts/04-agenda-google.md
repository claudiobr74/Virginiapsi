# Fase 4 — Agenda + Google Calendar + Meet

Use `google-calendar-meet` e `/google-calendar-sync`.

Implemente conexão Google separada do login:
- start OAuth;
- callback/state;
- offline access;
- token encryption;
- listar calendários e selecionar calendar_id;
- reconnect/disconnect/status.

Implemente Agenda SerenaPsi dia/semana/mês:
- pull/upsert Google;
- eventos externos read-only;
- eventos SerenaPsi gerenciados;
- conflito;
- criar/editar/remarcar/cancelar;
- `Nome Sobrenome • PAC-###`;
- consulta online cria Meet real via `conferenceData.createRequest` com `conferenceSolutionKey.type="hangoutsMeet"`, `conferenceDataVersion=1` e requestId novo;
- tratar criação assíncrona `pending → success|failure`, reconsultando antes de persistir a URL;
- audit/idempotency/sync status.

Nunca fabrique Meet URL.

Gate: testes de sync, timezone, idempotência, external protection, `hangoutsMeet` e estados pending/success/failure do conferenceData. Se credencial Google impedir E2E real, marque apenas esse item EXTERNAL_BLOCKED e mantenha todos os testes locais/contratuais PASS.
