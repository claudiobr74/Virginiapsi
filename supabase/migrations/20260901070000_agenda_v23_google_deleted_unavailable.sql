-- Agenda V2.3: Google source-deletion reconciliation + unavailable color map.
-- google_deleted_at is a soft-delete of the GOOGLE_EXTERNAL mirror only.
-- It is not a clinical cancellation. cancelled_google_color_ids stays as a
-- legacy column and is not used for the unavailable/colorId-8 clinic convention.

alter table public.appointments
  add column if not exists google_deleted_at timestamptz;

comment on column public.appointments.google_deleted_at is
  'Set when Google Calendar reports the event as deleted (status=cancelled tombstone) or when the event is absent from a completed pull snapshot. Hidden from Agenda/Meu Dia. Does not rewrite clinical status.';

alter table public.google_calendar_connections
  add column if not exists unavailable_google_color_ids text[] not null default '{}';

comment on column public.google_calendar_connections.unavailable_google_color_ids is
  'Google Calendar event.colorId values this organization treats as unavailable (not an active session). Per-connection clinic convention; not a global palette. Distinct from legacy cancelled_google_color_ids.';

comment on column public.google_calendar_connections.cancelled_google_color_ids is
  'LEGACY. Do not use for unavailable/colorId clinic convention. Kept to avoid a breaking drop. Prefer unavailable_google_color_ids.';

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
    google_event_type, summary_snapshot, sync_status, last_synced_at, google_deleted_at
  )
  values (
    org_id, p_starts_at, p_ends_at, p_status, 'GOOGLE_EXTERNAL', false,
    'read_only', p_google_calendar_id, p_google_event_id, p_google_etag, p_google_color_id,
    p_google_event_type, p_summary_snapshot, 'synced', now(), null
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
    last_synced_at = now(),
    google_deleted_at = null
  where public.appointments.organization_id = org_id
    and public.appointments.origin = 'GOOGLE_EXTERNAL'
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text, text) from public;
revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text, text) from anon;
grant execute on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status, text, text) to authenticated;

create or replace function public.mark_external_google_event_deleted(
  org_id uuid,
  p_google_calendar_id text,
  p_google_event_id text
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
    raise exception 'google mirror delete requires an active membership'
      using errcode = '42501';
  end if;

  if p_google_calendar_id is null or btrim(p_google_calendar_id) = ''
     or p_google_event_id is null or btrim(p_google_event_id) = '' then
    return null;
  end if;

  update public.appointments
     set google_deleted_at = coalesce(google_deleted_at, now()),
         last_synced_at = now()
   where organization_id = org_id
     and origin = 'GOOGLE_EXTERNAL'
     and google_calendar_id = p_google_calendar_id
     and google_event_id = p_google_event_id
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.mark_external_google_event_deleted(uuid, text, text) from public;
revoke all on function public.mark_external_google_event_deleted(uuid, text, text) from anon;
grant execute on function public.mark_external_google_event_deleted(uuid, text, text) to authenticated;

create or replace function public.reconcile_unseen_google_mirrors(
  org_id uuid,
  p_google_calendar_id text,
  p_seen_google_event_ids text[],
  p_window_start timestamptz,
  p_window_end timestamptz
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  marked integer := 0;
begin
  if not public.is_org_member(org_id) then
    raise exception 'google mirror reconcile requires an active membership'
      using errcode = '42501';
  end if;

  if p_google_calendar_id is null or btrim(p_google_calendar_id) = ''
     or p_window_start is null or p_window_end is null then
    return 0;
  end if;

  update public.appointments
     set google_deleted_at = now(),
         last_synced_at = now()
   where organization_id = org_id
     and origin = 'GOOGLE_EXTERNAL'
     and google_calendar_id = p_google_calendar_id
     and google_deleted_at is null
     and google_event_id is not null
     and not (google_event_id = any(coalesce(p_seen_google_event_ids, '{}'::text[])))
     and starts_at < p_window_end
     and ends_at > p_window_start;

  get diagnostics marked = row_count;
  return marked;
end;
$$;

revoke all on function public.reconcile_unseen_google_mirrors(uuid, text, text[], timestamptz, timestamptz) from public;
revoke all on function public.reconcile_unseen_google_mirrors(uuid, text, text[], timestamptz, timestamptz) from anon;
grant execute on function public.reconcile_unseen_google_mirrors(uuid, text, text[], timestamptz, timestamptz) to authenticated;

create or replace function public.set_google_unavailable_color_ids(
  org_id uuid,
  color_ids text[]
)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized text[];
begin
  if not public.is_psychologist_admin(org_id) then
    raise exception 'only psychologist_admin may set unavailable Google color ids'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
    into normalized
  from unnest(coalesce(color_ids, '{}'::text[])) as value
  where btrim(value) ~ '^[0-9]{1,4}$';

  update public.google_calendar_connections
     set unavailable_google_color_ids = coalesce(normalized, '{}'::text[])
   where organization_id = org_id;

  if not found then
    raise exception 'google calendar connection not found'
      using errcode = 'P0002';
  end if;

  return coalesce(normalized, '{}'::text[]);
end;
$$;

revoke all on function public.set_google_unavailable_color_ids(uuid, text[]) from public;
revoke all on function public.set_google_unavailable_color_ids(uuid, text[]) from anon;
grant execute on function public.set_google_unavailable_color_ids(uuid, text[]) to authenticated;

create or replace function public.protect_unavailable_google_color_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.calendar_id is distinct from old.calendar_id
     and old.calendar_id is not null
     and new.calendar_id is not null then
    new.unavailable_google_color_ids := '{}'::text[];
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.unavailable_google_color_ids is distinct from old.unavailable_google_color_ids
     and not public.is_psychologist_admin(new.organization_id) then
    raise exception 'only psychologist_admin may set unavailable Google color ids'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists google_calendar_connections_protect_unavailable_colors
  on public.google_calendar_connections;
create trigger google_calendar_connections_protect_unavailable_colors
  before update on public.google_calendar_connections
  for each row
  execute function public.protect_unavailable_google_color_ids();
