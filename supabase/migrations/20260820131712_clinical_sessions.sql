-- Tesseli — Phase 6: clinical session, DPEP, transcription and Session AI
-- run metadata.
-- Specs: docs/04-data-model.md §Sessões/§IA, docs/05-security-rbac-rls.md,
-- docs/08-implementation-phases.md Fase 6, .cursor/rules/10-clinical-domain.mdc,
-- docs/22-transcription-provider-decision.md.
--
-- Design decisions taken here (not fully pinned down by the docs):
--   * every table introduced in this migration is psychologist_admin-only in
--     RLS (SELECT/INSERT/UPDATE, no DELETE). The RBAC matrix in
--     docs/05-security-rbac-rls.md gives "NENHUM" to the secretary for
--     "session DPEP", "clinical working notes", "transcripts" and
--     "supervisor/AI clinical" — clinical_sessions itself is the umbrella
--     record for all of that, so it gets the same boundary rather than the
--     "administrative" boundary patients has;
--   * `clinical_sessions.version` is the single optimistic-concurrency
--     counter for the session's clinical content as a whole (DPEP AND
--     working notes), matching the literal wording in docs/04-data-model.md
--     ("toda escrita de conteúdo clínico (DPEP, working notes) inclui a
--     versão lida"). `session_dpep.version` is a denormalized stamp of which
--     session version a given DPEP write happened at, not an independent
--     concurrency gate;
--   * `save_session_dpep()`/`save_session_working_notes()` are
--     SECURITY INVOKER, not DEFINER: the calling user's own RLS grants on
--     clinical_sessions/session_dpep/session_clinical_working_notes are what
--     authorize the write. The function only adds the atomic
--     compare-and-bump semantics; there is no privilege to escalate;
--   * `session_transcript_segments` INSERT is still RLS-gated to
--     psychologist_admin (defense in depth, tenant/role enforcement), but
--     the actual "no segment without a valid capture grant" rule from
--     docs/22 is an application-layer check before this INSERT ever runs —
--     RLS cannot verify a stateless signed grant token;
--   * `ai_runs`/`ai_artifacts` are intentionally NOT restricted to a fixed
--     `purpose`/`type` enum tied only to this phase's three Session AI
--     operations: they use `text` with a `check` listing the values this
--     phase actually produces, so a future phase (Supervisor, Knowledge) can
--     extend the constraint without an enum rename.

create type public.clinical_session_status as enum (
  'draft',
  'in_progress',
  'finalized',
  'canceled'
);

create type public.ai_run_status as enum ('running', 'succeeded', 'failed');

create type public.ai_artifact_review_status as enum (
  'pending',
  'appended',
  'discarded'
);

-- ---------------------------------------------------------------------------
-- clinical_sessions
-- ---------------------------------------------------------------------------

create table public.clinical_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  patient_id uuid not null
    references public.patients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  therapist_user_id uuid not null references auth.users (id) on delete restrict,
  status public.clinical_session_status not null default 'draft',
  started_at timestamptz,
  ended_at timestamptz,
  finalization_idempotency_key text,
  -- Optimistic-concurrency counter for this session's clinical content as a
  -- whole (DPEP + working notes) — see file header.
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_sessions_ended_after_started check (
    ended_at is null or started_at is null or ended_at >= started_at
  ),
  constraint clinical_sessions_finalized_has_end check (
    status <> 'finalized' or ended_at is not null
  ),
  -- Idempotent finalization: a given (organization_id, key) can only ever
  -- correspond to one finalized session, so retrying with the same key on
  -- an already-finalized session is a safe no-op rather than a double action.
  constraint clinical_sessions_idempotency_unique
    unique (organization_id, finalization_idempotency_key)
);

comment on column public.clinical_sessions.version is
  'Optimistic-concurrency counter bumped by save_session_dpep()/save_session_working_notes(); a stale read returns no rows (409 at the application boundary).';

create index clinical_sessions_patient_idx
  on public.clinical_sessions (organization_id, patient_id, created_at desc);
create index clinical_sessions_appointment_idx
  on public.clinical_sessions (appointment_id)
  where appointment_id is not null;

create trigger clinical_sessions_set_updated_at
  before update on public.clinical_sessions
  for each row execute function public.set_updated_at();

-- patient_id and appointment_id (when present) must belong to the same
-- organization, and appointment_id (when present) must belong to the same
-- patient. therapist_user_id is stamped from auth.uid(), never trusted from
-- the client, and stays fixed once set — a session's authorship is a fact.
create or replace function public.assert_clinical_session_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
  appt_org uuid;
  appt_patient uuid;
begin
  select organization_id into patient_org
  from public.patients
  where id = new.patient_id;

  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'clinical session patient must belong to the same organization'
      using errcode = '23514';
  end if;

  if new.appointment_id is not null then
    select organization_id, patient_id into appt_org, appt_patient
    from public.appointments
    where id = new.appointment_id;

    if appt_org is null or appt_org <> new.organization_id then
      raise exception 'clinical session appointment must belong to the same organization'
        using errcode = '23514';
    end if;
    if appt_patient is distinct from new.patient_id then
      raise exception 'clinical session appointment must belong to the same patient'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.therapist_user_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.therapist_user_id := old.therapist_user_id;
    new.organization_id := old.organization_id;
    new.patient_id := old.patient_id;
  end if;

  return new;
end;
$$;

create trigger clinical_sessions_assert_consistency
  before insert or update on public.clinical_sessions
  for each row execute function public.assert_clinical_session_consistency();

grant select, insert, update on public.clinical_sessions to authenticated;

alter table public.clinical_sessions enable row level security;

create policy clinical_sessions_admin_select
  on public.clinical_sessions
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy clinical_sessions_admin_insert
  on public.clinical_sessions
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy clinical_sessions_admin_update
  on public.clinical_sessions
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- No DELETE policy: a clinical session is never physically removed, only
-- moved to 'canceled'.

-- Starts (or resumes) a session for a patient, refusing to open a second
-- concurrent one for the same patient — the active-session UI is
-- single-focus per docs/12-screen-fidelity-blueprint.md §9.
create or replace function public.start_clinical_session(
  org_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  existing_id uuid;
  new_id uuid;
begin
  select id into existing_id
  from public.clinical_sessions
  where organization_id = org_id
    and patient_id = p_patient_id
    and status in ('draft', 'in_progress')
  limit 1;

  if existing_id is not null then
    update public.clinical_sessions
    set status = 'in_progress',
        started_at = coalesce(started_at, now())
    where id = existing_id;
    return existing_id;
  end if;

  insert into public.clinical_sessions (
    organization_id, patient_id, appointment_id, status, started_at
  )
  values (org_id, p_patient_id, p_appointment_id, 'in_progress', now())
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.start_clinical_session(uuid, uuid, uuid) from public;
grant execute on function public.start_clinical_session(uuid, uuid, uuid) to authenticated;

-- Idempotent: calling finalize twice with the same key on an
-- already-finalized session is a no-op success, not a second finalization.
create or replace function public.finalize_clinical_session(
  p_session_id uuid,
  org_id uuid,
  p_idempotency_key text
)
-- Output columns are prefixed to avoid PL/pgSQL treating them as the same
-- identifier as clinical_sessions.status/ended_at inside this function body
-- ("column reference is ambiguous" between the OUT parameter and the table
-- column of the same name).
returns table (out_status public.clinical_session_status, out_ended_at timestamptz)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  current_status public.clinical_session_status;
  current_key text;
begin
  select cs.status, cs.finalization_idempotency_key
  into current_status, current_key
  from public.clinical_sessions cs
  where cs.id = p_session_id and cs.organization_id = org_id;

  if current_status = 'finalized' and current_key = p_idempotency_key then
    return query
      select cs.status, cs.ended_at
      from public.clinical_sessions cs
      where cs.id = p_session_id;
    return;
  end if;

  return query
    update public.clinical_sessions
    set status = 'finalized',
        ended_at = now(),
        finalization_idempotency_key = p_idempotency_key
    where id = p_session_id
      and organization_id = org_id
      and status <> 'finalized'
    returning clinical_sessions.status, clinical_sessions.ended_at;
end;
$$;

revoke all on function public.finalize_clinical_session(uuid, uuid, text) from public;
grant execute on function public.finalize_clinical_session(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- session_dpep
-- ---------------------------------------------------------------------------

create table public.session_dpep (
  session_id uuid primary key
    references public.clinical_sessions (id) on delete cascade,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  demand text,
  procedures text,
  evolution text,
  plan text,
  version integer not null default 1,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger session_dpep_set_updated_at
  before update on public.session_dpep
  for each row execute function public.set_updated_at();

create or replace function public.assert_session_dpep_same_org()
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
    raise exception 'session_dpep organization must match its clinical session'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger session_dpep_assert_same_org
  before insert or update on public.session_dpep
  for each row execute function public.assert_session_dpep_same_org();

grant select, insert, update on public.session_dpep to authenticated;

alter table public.session_dpep enable row level security;

create policy session_dpep_admin_select
  on public.session_dpep
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy session_dpep_admin_insert
  on public.session_dpep
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy session_dpep_admin_update
  on public.session_dpep
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- Atomic compare-and-bump: the write only applies if clinical_sessions.version
-- still equals p_expected_version. Empty result set = conflict (409 at the
-- server boundary). SECURITY INVOKER: relies entirely on the caller's own
-- RLS grants above and on clinical_sessions.
create or replace function public.save_session_dpep(
  p_session_id uuid,
  org_id uuid,
  p_expected_version integer,
  p_demand text,
  p_procedures text,
  p_evolution text,
  p_plan text
)
returns table (new_version integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  bumped integer;
begin
  update public.clinical_sessions
  set version = version + 1
  where id = p_session_id
    and organization_id = org_id
    and version = p_expected_version
  returning version into bumped;

  if bumped is null then
    return;
  end if;

  insert into public.session_dpep (
    session_id, organization_id, demand, procedures, evolution, plan,
    version, updated_by
  )
  values (
    p_session_id, org_id, p_demand, p_procedures, p_evolution, p_plan,
    bumped, auth.uid()
  )
  on conflict (session_id) do update set
    demand = excluded.demand,
    procedures = excluded.procedures,
    evolution = excluded.evolution,
    plan = excluded.plan,
    version = excluded.version,
    updated_by = excluded.updated_by;

  return query select bumped;
end;
$$;

revoke all on function public.save_session_dpep(uuid, uuid, integer, text, text, text, text) from public;
grant execute on function public.save_session_dpep(uuid, uuid, integer, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- session_clinical_working_notes
-- ---------------------------------------------------------------------------

create table public.session_clinical_working_notes (
  session_id uuid primary key
    references public.clinical_sessions (id) on delete cascade,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  formulation text,
  hypotheses text,
  working_observations text,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.session_clinical_working_notes is
  'Clinical working area separate from DPEP and administrative data (docs/01 §Área de trabalho clínico separada). Never legally "inaccessible" by default — governed by professional norms, not a UI label.';

create trigger session_working_notes_set_updated_at
  before update on public.session_clinical_working_notes
  for each row execute function public.set_updated_at();

create or replace function public.assert_working_notes_same_org()
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
    raise exception 'session_clinical_working_notes organization must match its clinical session'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger session_working_notes_assert_same_org
  before insert or update on public.session_clinical_working_notes
  for each row execute function public.assert_working_notes_same_org();

grant select, insert, update on public.session_clinical_working_notes to authenticated;

alter table public.session_clinical_working_notes enable row level security;

create policy session_working_notes_admin_select
  on public.session_clinical_working_notes
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy session_working_notes_admin_insert
  on public.session_clinical_working_notes
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy session_working_notes_admin_update
  on public.session_clinical_working_notes
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

create or replace function public.save_session_working_notes(
  p_session_id uuid,
  org_id uuid,
  p_expected_version integer,
  p_formulation text,
  p_hypotheses text,
  p_working_observations text
)
returns table (new_version integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  bumped integer;
begin
  update public.clinical_sessions
  set version = version + 1
  where id = p_session_id
    and organization_id = org_id
    and version = p_expected_version
  returning version into bumped;

  if bumped is null then
    return;
  end if;

  insert into public.session_clinical_working_notes (
    session_id, organization_id, formulation, hypotheses,
    working_observations, updated_by
  )
  values (
    p_session_id, org_id, p_formulation, p_hypotheses,
    p_working_observations, auth.uid()
  )
  on conflict (session_id) do update set
    formulation = excluded.formulation,
    hypotheses = excluded.hypotheses,
    working_observations = excluded.working_observations,
    updated_by = excluded.updated_by;

  return query select bumped;
end;
$$;

revoke all on function public.save_session_working_notes(uuid, uuid, integer, text, text, text) from public;
grant execute on function public.save_session_working_notes(uuid, uuid, integer, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- session_transcript_segments / session_transcript_artifacts
-- ---------------------------------------------------------------------------

create table public.session_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.clinical_sessions (id) on delete cascade,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  text text not null,
  is_final boolean not null default true,
  start_ms integer,
  end_ms integer,
  provider text not null check (provider in ('local-webgpu', 'local-wasm', 'groq-batch')),
  provider_confidence numeric(4, 3) check (provider_confidence between 0 and 1),
  -- e.g. {"lowConfidence": true, "possibleMisrecognition": ["nomes", "negação"]}
  ambiguity_flags jsonb,
  created_at timestamptz not null default now(),
  constraint session_transcript_segments_unique_sequence
    unique (session_id, sequence)
);

comment on constraint session_transcript_segments_unique_sequence
  on public.session_transcript_segments is
  'sequence is the idempotency key for a final segment: reconnects/resumes must upsert by (session_id, sequence), never duplicate text.';

create index session_transcript_segments_session_idx
  on public.session_transcript_segments (session_id, sequence);

create or replace function public.assert_transcript_segment_same_org()
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
    raise exception 'transcript segment organization must match its clinical session'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger transcript_segments_assert_same_org
  before insert on public.session_transcript_segments
  for each row execute function public.assert_transcript_segment_same_org();

-- Append-only: a transcript segment is never edited or removed once
-- persisted, matching audit_events' invariant for the same reason (it is
-- evidence of what happened during the session).
grant select, insert on public.session_transcript_segments to authenticated;

alter table public.session_transcript_segments enable row level security;

create policy transcript_segments_admin_select
  on public.session_transcript_segments
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

-- RLS is tenant/role enforcement (principle #1 of docs/05); the additional
-- "no segment without a valid session_capture_grant" rule from docs/22 is an
-- application-layer gate that runs before this INSERT is ever attempted —
-- RLS has no way to verify a stateless signed grant token.
create policy transcript_segments_admin_insert
  on public.session_transcript_segments
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create table public.session_transcript_artifacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null
    references public.clinical_sessions (id) on delete cascade,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  storage_path text,
  sha256 text,
  provider text not null check (provider in ('local-webgpu', 'local-wasm', 'groq-batch')),
  duration_seconds numeric(10, 2),
  language text,
  created_at timestamptz not null default now()
);

create or replace function public.assert_transcript_artifact_same_org()
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
    raise exception 'transcript artifact organization must match its clinical session'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger transcript_artifacts_assert_same_org
  before insert on public.session_transcript_artifacts
  for each row execute function public.assert_transcript_artifact_same_org();

grant select, insert on public.session_transcript_artifacts to authenticated;

alter table public.session_transcript_artifacts enable row level security;

create policy transcript_artifacts_admin_select
  on public.session_transcript_artifacts
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy transcript_artifacts_admin_insert
  on public.session_transcript_artifacts
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- ai_runs / ai_artifacts
-- ---------------------------------------------------------------------------

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  session_id uuid references public.clinical_sessions (id) on delete set null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  purpose text not null
    check (purpose in ('session_live', 'session_preparation', 'session_closing')),
  provider text not null default 'gemini',
  model text not null,
  prompt_name text not null,
  prompt_version text not null,
  schema_version text not null,
  consent_version text,
  status public.ai_run_status not null default 'running',
  source_ids jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.ai_runs is
  'Execution metadata only — never the prompt payload, transcript or clinical response text (docs/14 §12).';

create index ai_runs_session_idx on public.ai_runs (session_id) where session_id is not null;
create index ai_runs_org_created_idx on public.ai_runs (organization_id, created_at desc);

create or replace function public.assert_ai_run_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
  session_org uuid;
  session_patient uuid;
begin
  if new.patient_id is not null then
    select organization_id into patient_org
    from public.patients
    where id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then
      raise exception 'ai_runs patient must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if new.session_id is not null then
    select organization_id, patient_id into session_org, session_patient
    from public.clinical_sessions
    where id = new.session_id;
    if session_org is null or session_org <> new.organization_id then
      raise exception 'ai_runs session must belong to the same organization'
        using errcode = '23514';
    end if;
    if new.patient_id is not null and session_patient is distinct from new.patient_id then
      raise exception 'ai_runs session must belong to the same patient'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.actor_user_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.actor_user_id := old.actor_user_id;
    new.organization_id := old.organization_id;
  end if;

  return new;
end;
$$;

create trigger ai_runs_assert_consistency
  before insert or update on public.ai_runs
  for each row execute function public.assert_ai_run_consistency();

grant select, insert, update on public.ai_runs to authenticated;

alter table public.ai_runs enable row level security;

create policy ai_runs_admin_select
  on public.ai_runs
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy ai_runs_admin_insert
  on public.ai_runs
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy ai_runs_admin_update
  on public.ai_runs
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

create table public.ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_runs (id) on delete cascade,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  type text not null
    check (type in ('session_live', 'session_preparation', 'session_closing')),
  structured_content jsonb not null,
  review_status public.ai_artifact_review_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_artifacts_reviewed_consistency check (
    (review_status = 'pending' and reviewed_at is null)
    or (review_status <> 'pending' and reviewed_at is not null)
  )
);

comment on table public.ai_artifacts is
  'Structured AI output, always draft (review_status=pending) until an explicit clinician action appends or discards it. Never auto-committed to session_dpep/session_clinical_working_notes.';

create index ai_artifacts_run_idx on public.ai_artifacts (run_id);

create trigger ai_artifacts_set_updated_at
  before update on public.ai_artifacts
  for each row execute function public.set_updated_at();

create or replace function public.assert_ai_artifact_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_org uuid;
begin
  select organization_id into run_org from public.ai_runs where id = new.run_id;
  if run_org is null or run_org <> new.organization_id then
    raise exception 'ai_artifacts organization must match its ai_run'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_status := 'pending';
  elsif tg_op = 'UPDATE' then
    -- The artifact's own content is immutable once produced by the model —
    -- only its review lifecycle (status/reviewer/timestamp) may change.
    new.structured_content := old.structured_content;
    new.type := old.type;
    new.run_id := old.run_id;
    new.organization_id := old.organization_id;
    if new.review_status <> old.review_status and old.review_status <> 'pending' then
      raise exception 'ai_artifacts review_status cannot change once reviewed'
        using errcode = '42501';
    end if;
    if new.review_status <> 'pending' then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

create trigger ai_artifacts_assert_same_org
  before insert or update on public.ai_artifacts
  for each row execute function public.assert_ai_artifact_same_org();

grant select, insert, update on public.ai_artifacts to authenticated;

alter table public.ai_artifacts enable row level security;

create policy ai_artifacts_admin_select
  on public.ai_artifacts
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy ai_artifacts_admin_insert
  on public.ai_artifacts
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy ai_artifacts_admin_update
  on public.ai_artifacts
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- session-audio-fallback storage bucket (optional Groq fallback only)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('session-audio-fallback', 'session-audio-fallback', false)
on conflict (id) do nothing;

-- Deliberately zero storage.objects policies for anon/authenticated on this
-- bucket: per docs/05-security-rbac-rls.md, it "não pode ter INSERT genérico
-- baseado apenas em membership". The only way to write here is a signed
-- upload URL minted server-side (src/lib/integrations/transcription/
-- fallback-storage.ts) via the service-role client, issued only after the
-- same consent gate as the on-device capture grant.
