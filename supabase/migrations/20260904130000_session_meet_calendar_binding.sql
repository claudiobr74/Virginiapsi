-- Calendar-backed Meet creation for personal Gmail accounts.
-- The clinical session keeps a deterministic link to the Google Calendar
-- event that owns the conference. Legacy Meet REST rows remain valid.

alter table public.session_meet_bindings
  add column if not exists google_calendar_id text,
  add column if not exists google_event_id text;

alter table public.session_meet_bindings
  drop constraint if exists session_meet_ready_has_google_identity;

alter table public.session_meet_bindings
  add constraint session_meet_ready_has_google_identity check (
    status <> 'ready' or meet_url is not null
  );

create unique index if not exists session_meet_bindings_calendar_event_uidx
  on public.session_meet_bindings (google_calendar_id, google_event_id)
  where google_calendar_id is not null and google_event_id is not null;

comment on column public.session_meet_bindings.google_calendar_id is
  'Google Calendar owning the event used to create/recover the session Meet conference.';
comment on column public.session_meet_bindings.google_event_id is
  'Google Calendar event used as the durable source of truth for the Meet conference.';
comment on column public.session_meet_bindings.meet_space_name is
  'Legacy Meet REST resource name. Null for Calendar-backed Meet creation.';
