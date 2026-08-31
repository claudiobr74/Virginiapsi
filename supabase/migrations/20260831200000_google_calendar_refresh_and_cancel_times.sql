-- Keep wall-clock of already-imported GOOGLE_EXTERNAL rows when Google's
-- incremental payload is status=cancelled without start/end.
-- Does not change Google credential RPCs (connect stays psychologist_admin-only).

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
    organization_id, starts_at, ends_at, status, origin, managed_by_tesseli,
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
    starts_at = case
      when excluded.status = 'cancelled' then public.appointments.starts_at
      else excluded.starts_at
    end,
    ends_at = case
      when excluded.status = 'cancelled' then public.appointments.ends_at
      else excluded.ends_at
    end,
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
