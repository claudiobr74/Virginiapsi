-- Agenda V2: persist Google colorId as metadata and allow server-side
-- mirror updates/deletes for GOOGLE_EXTERNAL without opening table RLS.

alter table public.appointments
  add column if not exists google_color_id text;

comment on column public.appointments.google_color_id is
  'Google Calendar event.colorId metadata. Not the semantic source for cancellation.';

-- CREATE OR REPLACE cannot add parameters; drop previous signatures.
drop function if exists public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text);
drop function if exists public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status);
drop function if exists public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text);

create or replace function public.upsert_external_appointment(
  org_id uuid,
  p_google_calendar_id text,
  p_google_event_id text,
  p_google_etag text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_summary_snapshot text,
  p_status public.appointment_status default 'scheduled',
  p_google_color_id text default null
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
    organization_id, starts_at, ends_at, status, origin, managed_by_tesseli,
    sync_policy, google_calendar_id, google_event_id, google_etag, google_color_id,
    summary_snapshot, sync_status, last_synced_at
  )
  values (
    org_id, p_starts_at, p_ends_at, p_status, 'GOOGLE_EXTERNAL', false,
    'read_only', p_google_calendar_id, p_google_event_id, p_google_etag, p_google_color_id,
    p_summary_snapshot, 'synced', now()
  )
  on conflict (organization_id, google_calendar_id, google_event_id)
  do update set
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    google_etag = excluded.google_etag,
    google_color_id = excluded.google_color_id,
    summary_snapshot = excluded.summary_snapshot,
    sync_status = 'synced',
    last_synced_at = now()
  where public.appointments.organization_id = org_id
    and public.appointments.origin = 'GOOGLE_EXTERNAL'
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text) from public;
revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text) from anon;
grant execute on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text) to authenticated;

create or replace function public.update_external_appointment_mirror(
  org_id uuid,
  p_appointment_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_summary_snapshot text,
  p_status public.appointment_status,
  p_google_etag text default null,
  p_google_color_id text default null,
  p_patient_id uuid default null,
  p_modality public.consultation_modality default null
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
    raise exception 'external appointment update requires an active membership'
      using errcode = '42501';
  end if;

  update public.appointments
  set
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    summary_snapshot = p_summary_snapshot,
    status = p_status,
    google_etag = coalesce(p_google_etag, google_etag),
    google_color_id = coalesce(p_google_color_id, google_color_id),
    patient_id = coalesce(p_patient_id, patient_id),
    modality = coalesce(p_modality, modality),
    sync_status = 'synced',
    last_synced_at = now()
  where id = p_appointment_id
    and organization_id = org_id
    and origin = 'GOOGLE_EXTERNAL'
    and google_event_id is not null
  returning id into result_id;

  if result_id is null then
    raise exception 'external appointment mirror not found'
      using errcode = 'P0002';
  end if;

  return result_id;
end;
$$;

revoke all on function public.update_external_appointment_mirror(uuid, uuid, timestamptz, timestamptz, text, public.appointment_status, text, text, uuid, public.consultation_modality) from public;
revoke all on function public.update_external_appointment_mirror(uuid, uuid, timestamptz, timestamptz, text, public.appointment_status, text, text, uuid, public.consultation_modality) from anon;
grant execute on function public.update_external_appointment_mirror(uuid, uuid, timestamptz, timestamptz, text, public.appointment_status, text, text, uuid, public.consultation_modality) to authenticated;

create or replace function public.delete_external_appointment_mirror(
  org_id uuid,
  p_appointment_id uuid
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
    raise exception 'external appointment delete requires an active membership'
      using errcode = '42501';
  end if;

  delete from public.appointments
  where id = p_appointment_id
    and organization_id = org_id
    and origin = 'GOOGLE_EXTERNAL'
    and google_event_id is not null
  returning id into result_id;

  if result_id is null then
    raise exception 'external appointment mirror not found'
      using errcode = 'P0002';
  end if;

  return result_id;
end;
$$;

revoke all on function public.delete_external_appointment_mirror(uuid, uuid) from public;
revoke all on function public.delete_external_appointment_mirror(uuid, uuid) from anon;
grant execute on function public.delete_external_appointment_mirror(uuid, uuid) to authenticated;
