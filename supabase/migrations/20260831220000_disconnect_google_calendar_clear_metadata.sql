-- P0 hotfix: disconnect_google_calendar clears active-connection metadata
-- and removes mirrored GOOGLE_EXTERNAL cache. Does not rename appointment_origin.

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
      google_account_email = null,
      calendar_id = null,
      calendar_summary = null,
      scopes = '{}'::text[],
      last_synced_at = null,
      last_sync_error = null,
      connected_by_user_id = null
  where organization_id = org_id;

  delete from public.appointments
  where organization_id = org_id
    and origin = 'GOOGLE_EXTERNAL'
    and managed_by_tesseli = false
    and patient_id is null;
end;
$$;

-- Repair organizations already marked disconnected with leftover UI metadata
-- or mirrored Google events (the previous function did not clear them).
update public.google_calendar_connections
set google_account_email = null,
    calendar_id = null,
    calendar_summary = null,
    scopes = '{}'::text[],
    last_synced_at = null,
    last_sync_error = null,
    connected_by_user_id = null
where status = 'disconnected';

delete from public.appointments as a
using public.google_calendar_connections as c
where a.organization_id = c.organization_id
  and c.status = 'disconnected'
  and a.origin = 'GOOGLE_EXTERNAL'
  and a.managed_by_tesseli = false
  and a.patient_id is null;
