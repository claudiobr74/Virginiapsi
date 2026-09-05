-- VirgíniaPsi — Phase 2 selective security hardening.
-- Carries only invariants confirmed missing from current staging.

-- 1) Inbound WhatsApp patient matching must remain service-role-only even if
-- EXECUTE grants are widened accidentally in a future migration.
create or replace function public.match_patients_by_whatsapp_e164(p_e164 text)
returns table (organization_id uuid, patient_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with wanted as (
    select regexp_replace(coalesce(p_e164, ''), '\D', '', 'g') as digits
  )
  select p.organization_id, p.id
  from public.patients p
  cross join wanted w
  where btrim(coalesce(p.phone, '')) <> ''
    and (
      regexp_replace(p.phone, '\D', '', 'g') = w.digits
      or ('55' || regexp_replace(p.phone, '\D', '', 'g')) = w.digits
      or regexp_replace(p.phone, '\D', '', 'g') = right(w.digits, 11)
      or regexp_replace(p.phone, '\D', '', 'g') = right(w.digits, 10)
    );
end;
$$;

revoke all on function public.match_patients_by_whatsapp_e164(text)
  from public, anon, authenticated;
grant execute on function public.match_patients_by_whatsapp_e164(text)
  to service_role;

-- 2) Connection metadata tenant id is immutable. Regular members may select
-- calendar_id/calendar_summary, but may not rewrite connection ownership,
-- account/scopes/status or sync diagnostics through the Data API.
create or replace function public.assert_google_calendar_connection_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.organization_id := old.organization_id;

  if not public.is_psychologist_admin(old.organization_id) then
    new.status := old.status;
    new.google_account_email := old.google_account_email;
    new.scopes := old.scopes;
    new.last_synced_at := old.last_synced_at;
    new.last_sync_error := old.last_sync_error;
    new.connected_by_user_id := old.connected_by_user_id;
    new.cancelled_google_color_ids := old.cancelled_google_color_ids;
    new.unavailable_google_color_ids := old.unavailable_google_color_ids;
  end if;

  return new;
end;
$$;

drop trigger if exists google_calendar_connections_assert_tenant
  on public.google_calendar_connections;
create trigger google_calendar_connections_assert_tenant
  before update on public.google_calendar_connections
  for each row execute function public.assert_google_calendar_connection_tenant();

-- Appointments may be edited only within the organization where they were
-- created. Keep the existing patient/org consistency check as well.
create or replace function public.assert_appointment_patient_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
  end if;

  if new.patient_id is null then
    return new;
  end if;

  select p.organization_id into patient_org
  from public.patients p
  where p.id = new.patient_id;

  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'appointment patient must belong to the same organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- 3) OAuth secrets remain closed to the Data API. First Google connection is
-- admin-only; refreshing an already-connected tenant is allowed to any active
-- member so normal Calendar use does not fail for non-admin practitioners.
revoke all on table public.google_calendar_credentials
  from public, anon, authenticated;

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
declare
  already_connected boolean;
  effective_refresh_token text;
begin
  select exists (
    select 1
    from public.google_calendar_credentials c
    where c.organization_id = org_id
  ) into already_connected;

  if not already_connected and not public.is_psychologist_admin(org_id) then
    raise exception 'only psychologist_admin may connect Google Calendar'
      using errcode = '42501';
  end if;

  if already_connected and not public.is_org_member(org_id) then
    raise exception 'google calendar credentials require an active membership'
      using errcode = '42501';
  end if;

  select coalesce(
    nullif(p_refresh_token_encrypted, ''),
    (
      select c.refresh_token_encrypted
      from public.google_calendar_credentials c
      where c.organization_id = org_id
    )
  ) into effective_refresh_token;

  if effective_refresh_token is null then
    raise exception 'google refresh token required for first connection'
      using errcode = '22023';
  end if;

  insert into public.google_calendar_credentials (
    organization_id,
    access_token_encrypted,
    access_token_expires_at,
    refresh_token_encrypted
  ) values (
    org_id,
    p_access_token_encrypted,
    p_access_token_expires_at,
    effective_refresh_token
  )
  on conflict (organization_id) do update set
    access_token_encrypted = excluded.access_token_encrypted,
    access_token_expires_at = excluded.access_token_expires_at,
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    updated_at = now();

  insert into public.google_calendar_connections (
    organization_id,
    status,
    google_account_email,
    scopes,
    connected_by_user_id
  ) values (
    org_id,
    'connected',
    p_google_account_email,
    coalesce(p_scopes, array[]::text[]),
    auth.uid()
  )
  on conflict (organization_id) do update set
    status = 'connected',
    google_account_email = coalesce(
      excluded.google_account_email,
      public.google_calendar_connections.google_account_email
    ),
    scopes = case
      when p_scopes is not null then excluded.scopes
      else public.google_calendar_connections.scopes
    end,
    connected_by_user_id = coalesce(
      public.google_calendar_connections.connected_by_user_id,
      auth.uid()
    ),
    last_sync_error = null;
end;
$$;

revoke all on function public.upsert_google_credentials(
  uuid, text, timestamptz, text, text, text[]
) from public, anon;
grant execute on function public.upsert_google_credentials(
  uuid, text, timestamptz, text, text, text[]
) to authenticated;
