-- Session-owned Google Meet binding.
-- A Meet created from the clinical session belongs to that session, not to
-- the appointment. This deliberately supports in-person appointments that
-- become remote during care and sessions with no appointment at all.

create table public.session_meet_bindings (
  session_id uuid primary key
    references public.clinical_sessions (id) on delete cascade,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  status text not null default 'creating'
    check (status in ('creating', 'ready', 'failed')),
  meet_space_name text,
  meeting_code text,
  meet_url text,
  auto_transcription_enabled boolean not null default false,
  conference_record_id text,
  transcript_id text,
  transcript_status text not null default 'not_started'
    check (transcript_status in ('not_started', 'awaiting_artifact', 'imported', 'unavailable', 'failed')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_meet_ready_has_google_identity check (
    status <> 'ready'
    or (meet_space_name is not null and meeting_code is not null and meet_url is not null)
  )
);

comment on table public.session_meet_bindings is
  'Deterministic clinical-session -> Google Meet space binding. Appointment modality is intentionally irrelevant.';
comment on column public.session_meet_bindings.meet_space_name is
  'Permanent Meet REST resource name (spaces/{space}); preferred reverse-routing key for conference/transcript artifacts.';
comment on column public.session_meet_bindings.conference_record_id is
  'Populated when a concrete Meet conference instance is observed; reserved for deterministic transcript routing.';

create unique index session_meet_bindings_space_uidx
  on public.session_meet_bindings (meet_space_name)
  where meet_space_name is not null;

create unique index session_meet_bindings_conference_uidx
  on public.session_meet_bindings (conference_record_id)
  where conference_record_id is not null;

create trigger session_meet_bindings_set_updated_at
  before update on public.session_meet_bindings
  for each row execute function public.set_updated_at();

create or replace function public.assert_session_meet_binding_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_org uuid;
begin
  select organization_id into session_org
  from public.clinical_sessions
  where id = new.session_id;

  if session_org is null or session_org <> new.organization_id then
    raise exception 'session Meet binding organization must match its clinical session'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.session_id := old.session_id;
    new.organization_id := old.organization_id;
  end if;

  return new;
end;
$$;

create trigger session_meet_bindings_assert_consistency
  before insert or update on public.session_meet_bindings
  for each row execute function public.assert_session_meet_binding_consistency();

grant select, insert, update on public.session_meet_bindings to authenticated;

alter table public.session_meet_bindings enable row level security;

create policy session_meet_bindings_admin_select
  on public.session_meet_bindings
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy session_meet_bindings_admin_insert
  on public.session_meet_bindings
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy session_meet_bindings_admin_update
  on public.session_meet_bindings
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- No DELETE policy: the binding is part of the clinical session's audit trail.
