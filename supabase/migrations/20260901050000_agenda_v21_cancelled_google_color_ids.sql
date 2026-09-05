-- Agenda V2.1: per-organization Google colorId → cancelled mapping.
-- Clinic convention lives on the calendar connection, never as a global palette.

alter table public.google_calendar_connections
  add column if not exists cancelled_google_color_ids text[] not null default '{}';

comment on column public.google_calendar_connections.cancelled_google_color_ids is
  'Google Calendar event.colorId values this organization treats as cancelled. Per-connection clinic convention; not a global palette.';

comment on column public.appointments.google_color_id is
  'Google Calendar event.colorId metadata. Cancellation semantics use organization cancelled_google_color_ids plus title/status classifiers.';

create or replace function public.set_google_cancelled_color_ids(
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
    raise exception 'only psychologist_admin may set cancelled Google color ids'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
    into normalized
  from unnest(coalesce(color_ids, '{}'::text[])) as value
  where btrim(value) ~ '^[0-9]{1,4}$';

  update public.google_calendar_connections
     set cancelled_google_color_ids = coalesce(normalized, '{}'::text[])
   where organization_id = org_id;

  if not found then
    raise exception 'google calendar connection not found'
      using errcode = 'P0002';
  end if;

  return coalesce(normalized, '{}'::text[]);
end;
$$;

revoke all on function public.set_google_cancelled_color_ids(uuid, text[]) from public;
revoke all on function public.set_google_cancelled_color_ids(uuid, text[]) from anon;
grant execute on function public.set_google_cancelled_color_ids(uuid, text[]) to authenticated;

create or replace function public.protect_cancelled_google_color_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.calendar_id is distinct from old.calendar_id
     and old.calendar_id is not null
     and new.calendar_id is not null then
    new.cancelled_google_color_ids := '{}'::text[];
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.cancelled_google_color_ids is distinct from old.cancelled_google_color_ids
     and not public.is_psychologist_admin(new.organization_id) then
    raise exception 'only psychologist_admin may set cancelled Google color ids'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists google_calendar_connections_protect_cancelled_colors
  on public.google_calendar_connections;
create trigger google_calendar_connections_protect_cancelled_colors
  before update on public.google_calendar_connections
  for each row
  execute function public.protect_cancelled_google_color_ids();
