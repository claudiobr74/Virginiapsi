-- Agenda V2.2: persist Google Calendar event.eventType on the local mirror.
-- Used to keep cancelled_google_color_ids from applying to outOfOffice and
-- other special event types. Does not change cancellation mapping by itself.

alter table public.appointments
  add column if not exists google_event_type text;

comment on column public.appointments.google_event_type is
  'Google Calendar event.eventType (default, outOfOffice, focusTime, ...). Null means not yet observed.';

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
  p_google_color_id text default null,
  p_google_event_type text default null
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
    google_event_type, summary_snapshot, sync_status, last_synced_at
  )
  values (
    org_id, p_starts_at, p_ends_at, p_status, 'GOOGLE_EXTERNAL', false,
    'read_only', p_google_calendar_id, p_google_event_id, p_google_etag, p_google_color_id,
    p_google_event_type, p_summary_snapshot, 'synced', now()
  )
  on conflict (organization_id, google_calendar_id, google_event_id)
  do update set
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    google_etag = excluded.google_etag,
    google_color_id = excluded.google_color_id,
    google_event_type = excluded.google_event_type,
    summary_snapshot = excluded.summary_snapshot,
    sync_status = 'synced',
    last_synced_at = now()
  where public.appointments.organization_id = org_id
    and public.appointments.origin = 'GOOGLE_EXTERNAL'
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text, text) from public;
revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text, text) from anon;
grant execute on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text, text) to authenticated;

drop function if exists public.update_external_appointment_mirror(uuid, uuid, timestamptz, timestamptz, text, public.appointment_status, text, text, uuid, public.consultation_modality);

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
  p_modality public.consultation_modality default null,
  p_google_event_type text default null
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
    google_event_type = coalesce(p_google_event_type, google_event_type),
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

revoke all on function public.update_external_appointment_mirror(uuid, uuid, timestamptz, timestamptz, text, public.appointment_status, text, text, uuid, public.consultation_modality, text) from public;
revoke all on function public.update_external_appointment_mirror(uuid, uuid, timestamptz, timestamptz, text, public.appointment_status, text, text, uuid, public.consultation_modality, text) from anon;
grant execute on function public.update_external_appointment_mirror(uuid, uuid, timestamptz, timestamptz, text, public.appointment_status, text, text, uuid, public.consultation_modality, text) to authenticated;
