-- Calendar connection hardening: incremental sync token, appointment sync
-- diagnostics, admin-only connection updates, unique google_event_id per org.
-- Does not copy tokens between organizations and does not merge tenants.

alter table public.google_calendar_connections
  add column if not exists next_sync_token text;

comment on column public.google_calendar_connections.next_sync_token is
  'Google Calendar incremental sync token. Cleared on 410 Gone or calendar change.';

alter table public.appointments
  add column if not exists sync_error text;

alter table public.appointments
  alter column sync_status set default 'not_synced';

update public.appointments
set sync_status = 'not_synced'
where origin = 'TESSELI'
  and google_event_id is null
  and sync_status = 'synced';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_sync_status_check'
  ) then
    alter table public.appointments
      add constraint appointments_sync_status_check
      check (
        sync_status in ('not_synced', 'syncing', 'synced', 'error', 'conflict')
      );
  end if;
end $$;

-- Unique (organization_id, google_event_id) is NOT added: Tesseli-managed
-- appointments already store the same google_event_id they pushed. A second
-- unique would break Google → VirgíniaPsi pull of those events. Duplicates
-- of GOOGLE_EXTERNAL rows remain prevented by appointments_google_event_unique
-- (organization_id, google_calendar_id, google_event_id).

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
    connected_by_user_id = coalesce(auth.uid(), public.google_calendar_connections.connected_by_user_id),
    last_sync_error = null;
end;
$$;

create or replace function public.mark_google_connection_error(
  org_id uuid,
  p_error text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(org_id) then
    raise exception 'google connection error requires an active membership'
      using errcode = '42501';
  end if;

  update public.google_calendar_connections
  set
    status = 'error',
    last_sync_error = left(coalesce(p_error, 'google_connection_error'), 200)
  where organization_id = org_id;
end;
$$;

revoke all on function public.mark_google_connection_error(uuid, text) from public;
grant execute on function public.mark_google_connection_error(uuid, text) to authenticated;

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
  set
    status = 'disconnected',
    calendar_id = null,
    calendar_summary = null,
    last_sync_error = null,
    next_sync_token = null
  where organization_id = org_id;
end;
$$;

drop policy if exists google_calendar_connections_update_members on public.google_calendar_connections;

create policy google_calendar_connections_update_admin
  on public.google_calendar_connections
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
