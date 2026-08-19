---
name: google-calendar-sync
description: Implement or debug SerenaPsi Google Calendar/Meet OAuth and synchronization safely.
---
# Google Calendar Sync

1. Confirm OAuth is separate from app login.
2. Use server-side code exchange and encrypted token storage.
3. Implement calendar listing/selection.
4. Pull events into normalized appointments without taking ownership of external events.
5. Writes require managed_by_serenapsi and idempotency.
6. Online event Meet is generated with `conferenceData.createRequest`, `conferenceSolutionKey.type="hangoutsMeet"`, a new requestId, and request parameter `conferenceDataVersion=1`.
7. Handle asynchronous Meet `pending → success|failure`; re-fetch with bounded backoff and persist URL only on success.
8. Add sync/audit/error states.
9. Test pending/success/failure Meet creation, revoked token, duplicate operation, external event protection and timezone.
