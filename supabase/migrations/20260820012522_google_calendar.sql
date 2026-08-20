-- SerenaPsi — Phase 4: Google Calendar connection + Agenda appointments + Meet.
-- Specs: docs/04-data-model.md (§Agenda), docs/06-integrations.md §1,
-- docs/05-security-rbac-rls.md (§Tokens Google), prompts/04-agenda-google.md.
--
-- Design decisions made for this phase (not fully pinned down by the docs):
--   * one Google connection per organization (docs describe Settings showing
--     a single connected/disconnected state, not a per-professional list);
--   * OAuth tokens are split into their own zero-grant table
--     (google_calendar_credentials) so that even an authenticated admin
--     session can never SELECT the encrypted refresh token through the Data
--     API — only SECURITY DEFINER RPCs (called from server-only Node code,
--     which does the actual AES-GCM decryption) can reach it. This is the
--     same "RLS + zero policies" pattern already used for
--     patient_code_counters, and avoids introducing a service-role
--     consumer for what is otherwise a narrow, well-scoped need;
--   * connecting/disconnecting Google is an admin-only action (it is
--     effectively an integration/settings action, matching the
--     "settings/security/team: secretary NENHUM" row of the RBAC matrix),
--     but calendar_id *selection* and appointment CRUD stay open to both
--     roles per "calendar sync | CRUD | CRUD permitido";
--   * `meet_status`/`meet_request_id` are not explicitly listed in
--     docs/04-data-model.md's `appointments` columns, but are required to
--     implement the pending/success/failure Meet lifecycle mandated by
--     docs/06-integrations.md §1 and prompts/04-agenda-google.md.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.google_connection_status as enum (
  'connected',
  'disconnected',
  'error'
);

create type public.appointment_origin as enum ('SERENAPSI', 'GOOGLE_EXTERNAL');

create type public.appointment_status as enum (
  'scheduled',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

create type public.calendar_sync_policy as enum ('managed', 'read_only');

create type public.meet_creation_status as enum (
  'none',
  'pending',
  'success',
  'failure'
);

create type public.calendar_sync_direction as enum ('push', 'pull');

-- ---------------------------------------------------------------------------
-- google_calendar_connections — non-secret connection metadata.
-- ---------------------------------------------------------------------------

create table public.google_calendar_connections (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  status public.google_connection_status not null default 'disconnected',
  google_account_email text,
  calendar_id text,
  calendar_summary text,
  scopes text[] not null default array[]::text[],
  last_synced_at timestamptz,
  last_sync_error text,
  connected_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_connections is
  'Non-secret Google Calendar connection state. Tokens live in google_calendar_credentials, never here.';

create trigger google_calendar_connections_set_updated_at
  before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- google_calendar_credentials — encrypted tokens, reachable only through
-- SECURITY DEFINER RPCs. RLS is enabled with zero policies and there is no
-- GRANT to anon/authenticated: the Data API can never return a row from this
-- table to any client, admin included.
-- ---------------------------------------------------------------------------

create table public.google_calendar_credentials (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_credentials is
  'AES-GCM-encrypted OAuth tokens (encryption/decryption happens in Node, GOOGLE_TOKEN_ENCRYPTION_KEY). No role has a GRANT on this table; access is exclusively through get/upsert/disconnect_google_credentials().';

alter table public.google_calendar_credentials enable row level security;

create or replace function public.credentials_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger google_calendar_credentials_set_updated_at
  before update on public.google_calendar_credentials
  for each row execute function public.credentials_set_updated_at();

-- Admin-only: establishes or refreshes the connection's tokens + status in
-- one transaction. Called right after the OAuth code exchange, and again on
-- every silent access-token refresh.
create or replace function public.upsert_google_credentials(
  org_id uuid,
  p_access_token_encrypted text,
  p_access_token_expires_at timestamptz,
  p_refresh_token_encrypted text,
  p_google_account_email text default null,
  p_scopes text[] default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_psychologist_admin(org_id) then
    raise exception 'only psychologist_admin may connect Google Calendar'
      using errcode = '42501';
  end if;

  insert into public.google_calendar_credentials (
    organization_id, access_token_encrypted, access_token_expires_at,
    refresh_token_encrypted
  )
  values (org_id, p_access_token_encrypted, p_access_token_expires_at, p_refresh_token_encrypted)
  on conflict (organization_id) do update set
    access_token_encrypted = excluded.access_token_encrypted,
    access_token_expires_at = excluded.access_token_expires_at,
    -- A refresh call may legitimately omit a new refresh_token (Google only
    -- issues one on first consent/prompt=consent) — keep the existing one.
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, public.google_calendar_credentials.refresh_token_encrypted),
    updated_at = now();

  insert into public.google_calendar_connections (
    organization_id, status, google_account_email, scopes, connected_by_user_id
  )
  values (
    org_id, 'connected', p_google_account_email,
    coalesce(p_scopes, array[]::text[]), auth.uid()
  )
  on conflict (organization_id) do update set
    status = 'connected',
    google_account_email = coalesce(excluded.google_account_email, public.google_calendar_connections.google_account_email),
    scopes = case
      when p_scopes is not null then excluded.scopes
      else public.google_calendar_connections.scopes
    end,
    last_sync_error = null;
end;
$$;

-- Any active member may read the (still-encrypted) credentials to perform a
-- token refresh on behalf of the organization — reading an encrypted blob is
-- no more sensitive than the calendar data itself; only decryption (Node,
-- GOOGLE_TOKEN_ENCRYPTION_KEY) makes it usable, and only server code holds
-- that key.
create or replace function public.get_google_credentials(org_id uuid)
returns table (
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_encrypted text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.access_token_encrypted, c.access_token_expires_at, c.refresh_token_encrypted
  from public.google_calendar_credentials c
  where c.organization_id = org_id
    and public.is_org_member(org_id);
$$;

create or replace function public.disconnect_google_calendar(org_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_psychologist_admin(org_id) then
    raise exception 'only psychologist_admin may disconnect Google Calendar'
      using errcode = '42501';
  end if;

  delete from public.google_calendar_credentials where organization_id = org_id;

  update public.google_calendar_connections
  set status = 'disconnected',
      calendar_id = null,
      calendar_summary = null,
      last_sync_error = null
  where organization_id = org_id;
end;
$$;

revoke all on function public.upsert_google_credentials(uuid, text, timestamptz, text, text, text[]) from public;
revoke all on function public.get_google_credentials(uuid) from public;
revoke all on function public.disconnect_google_calendar(uuid) from public;
grant execute on function public.upsert_google_credentials(uuid, text, timestamptz, text, text, text[]) to authenticated;
grant execute on function public.get_google_credentials(uuid) to authenticated;
grant execute on function public.disconnect_google_calendar(uuid) to authenticated;

grant select, update on public.google_calendar_connections to authenticated;

alter table public.google_calendar_connections enable row level security;

create policy google_calendar_connections_select_members
  on public.google_calendar_connections
  for select
  to authenticated
  using (public.is_org_member(organization_id));

-- Only calendar_id/calendar_summary selection is meant to go through this
-- UPDATE policy; status/tokens are only ever changed by the RPCs above. Both
-- roles may pick which already-connected calendar to use for scheduling.
create policy google_calendar_connections_update_members
  on public.google_calendar_connections
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  modality public.consultation_modality not null default 'in_person',
  origin public.appointment_origin not null default 'SERENAPSI',
  managed_by_serenapsi boolean not null default true,
  sync_policy public.calendar_sync_policy not null default 'managed',
  google_calendar_id text,
  google_event_id text,
  google_etag text,
  meet_url text,
  meet_status public.meet_creation_status not null default 'none',
  meet_request_id text,
  summary_snapshot text,
  sync_status text not null default 'synced',
  last_synced_at timestamptz,
  -- Set by the client on create/reschedule so a retried request (double
  -- click, network retry) can never create a second appointment.
  create_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_ends_after_starts check (ends_at > starts_at),
  constraint appointments_origin_consistency check (
    (origin = 'SERENAPSI' and sync_policy = 'managed')
    or (origin = 'GOOGLE_EXTERNAL' and sync_policy = 'read_only' and managed_by_serenapsi = false)
  ),
  constraint appointments_google_event_unique
    unique (organization_id, google_calendar_id, google_event_id),
  constraint appointments_idempotency_unique
    unique (organization_id, create_idempotency_key)
);

comment on column public.appointments.summary_snapshot is
  'Denormalized "Nome Sobrenome • PAC-###" snapshot for display without a patient join; not the source of truth for the name.';

create index appointments_organization_starts_at_idx
  on public.appointments (organization_id, starts_at);
create index appointments_patient_id_idx on public.appointments (patient_id);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- patient_id must belong to the same organization as the appointment.
create or replace function public.assert_appointment_patient_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  if new.patient_id is null then
    return new;
  end if;

  select organization_id into patient_org
  from public.patients
  where id = new.patient_id;

  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'appointment patient must belong to the same organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger appointments_assert_patient_same_org
  before insert or update on public.appointments
  for each row execute function public.assert_appointment_patient_same_org();

grant select, insert, update, delete on public.appointments to authenticated;

alter table public.appointments enable row level security;

create policy appointments_select_members
  on public.appointments
  for select
  to authenticated
  using (public.is_org_member(organization_id));

-- Regular (non-RPC) writes are only ever allowed on SerenaPsi-managed rows:
-- a Google-imported event is read-only for every application role. Pulling
-- external events into this table happens exclusively through
-- upsert_external_appointment(), a SECURITY DEFINER function that bypasses
-- this restriction under its own membership check.
create policy appointments_insert_managed
  on public.appointments
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and origin = 'SERENAPSI'
  );

create policy appointments_update_managed
  on public.appointments
  for update
  to authenticated
  using (
    public.is_org_member(organization_id)
    and origin = 'SERENAPSI'
  )
  with check (
    public.is_org_member(organization_id)
    and origin = 'SERENAPSI'
  );

create policy appointments_delete_managed
  on public.appointments
  for delete
  to authenticated
  using (
    public.is_org_member(organization_id)
    and origin = 'SERENAPSI'
  );

-- Pull-sync path: upserts a GOOGLE_EXTERNAL row by (organization_id,
-- google_calendar_id, google_event_id). Never touches SERENAPSI rows, so a
-- managed appointment can never be silently overwritten by an external sync.
create or replace function public.upsert_external_appointment(
  org_id uuid,
  p_google_calendar_id text,
  p_google_event_id text,
  p_google_etag text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_summary_snapshot text,
  p_status public.appointment_status default 'scheduled'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result_id uuid;
begin
  if not public.is_org_member(org_id) then
    raise exception 'external appointment upsert requires an active membership'
      using errcode = '42501';
  end if;

  insert into public.appointments (
    organization_id, starts_at, ends_at, status, origin, managed_by_serenapsi,
    sync_policy, google_calendar_id, google_event_id, google_etag,
    summary_snapshot, sync_status, last_synced_at
  )
  values (
    org_id, p_starts_at, p_ends_at, p_status, 'GOOGLE_EXTERNAL', false,
    'read_only', p_google_calendar_id, p_google_event_id, p_google_etag,
    p_summary_snapshot, 'synced', now()
  )
  on conflict (organization_id, google_calendar_id, google_event_id)
  do update set
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    google_etag = excluded.google_etag,
    summary_snapshot = excluded.summary_snapshot,
    sync_status = 'synced',
    last_synced_at = now()
  where public.appointments.organization_id = org_id
    and public.appointments.origin = 'GOOGLE_EXTERNAL'
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status) from public;
grant execute on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status) to authenticated;

-- ---------------------------------------------------------------------------
-- calendar_sync_events — write intent/result audit, no clinical content.
-- ---------------------------------------------------------------------------

create table public.calendar_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  direction public.calendar_sync_direction not null,
  action text not null check (length(btrim(action)) between 1 and 80),
  request_payload jsonb not null default '{}'::jsonb,
  response_status text,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.calendar_sync_events is
  'Sync/write audit for Calendar/Meet. request_payload is structural only (ids/times), never clinical content.';

create index calendar_sync_events_organization_created_at_idx
  on public.calendar_sync_events (organization_id, created_at desc);

grant select on public.calendar_sync_events to authenticated;

alter table public.calendar_sync_events enable row level security;

create policy calendar_sync_events_select_admin
  on public.calendar_sync_events
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

-- No INSERT/UPDATE/DELETE policy for any role: writes go exclusively through
-- log_calendar_sync_event(), same append-only shape as audit_events.
create or replace function public.log_calendar_sync_event(
  org_id uuid,
  direction public.calendar_sync_direction,
  action text,
  appointment_id uuid default null,
  request_payload jsonb default '{}'::jsonb,
  response_status text default null,
  error_message text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_org_member(org_id) then
    raise exception 'calendar sync event requires an active membership'
      using errcode = '42501';
  end if;

  insert into public.calendar_sync_events (
    organization_id, appointment_id, direction, action, request_payload,
    response_status, error_message
  )
  values (
    org_id, appointment_id, direction, action, coalesce(request_payload, '{}'::jsonb),
    response_status, error_message
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.log_calendar_sync_event(uuid, public.calendar_sync_direction, text, uuid, jsonb, text, text) from public;
grant execute on function public.log_calendar_sync_event(uuid, public.calendar_sync_direction, text, uuid, jsonb, text, text) to authenticated;
