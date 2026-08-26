-- Tesseli — Phase 3: administrative patients + separate clinical profile.
-- Specs: docs/04-data-model.md (§Pacientes), docs/05-security-rbac-rls.md,
-- prompts/03-patients.md.
--
-- `patients` is administrative-only by design and carries no clinical field,
-- so the secretary matrix ("patients administrativos: CRUD | CRUD conforme
-- permissão") does not need any column-level trick: RLS on `patients` is the
-- same for both roles, and clinical content lives exclusively in
-- `patient_clinical_profile`, which only psychologist_admin can ever select.
--
-- `elimination_status` and its timestamps exist here because they are part
-- of the `patients` row per the data model, but the LGPD elimination request
-- flow itself (confirmation, anonymization routine, audit report) is Phase 12
-- scope (docs/08-implementation-phases.md) — this migration does not add any
-- RPC to trigger it.

-- ---------------------------------------------------------------------------
-- Enums
--
-- The spec (docs/04-data-model.md) lists these columns without a fixed value
-- set. Values below are a product decision made for this phase; revisit if a
-- future doc defines them more precisely.
-- ---------------------------------------------------------------------------

create type public.patient_status as enum (
  'active',
  'paused',
  'discharged',
  'archived'
);

create type public.consultation_modality as enum (
  'in_person',
  'online',
  'hybrid'
);

create type public.patient_elimination_status as enum (
  'active',
  'elimination_requested',
  'partially_eliminated',
  'eliminated'
);

-- ---------------------------------------------------------------------------
-- patient_code_counters + next_patient_public_code()
--
-- Atomic per-organization counter. The increment and the patient INSERT
-- happen in the same statement/transaction via the BEFORE INSERT trigger
-- below — never a separate "peek next code" round-trip — so concurrent
-- inserts can never observe or claim the same value.
-- ---------------------------------------------------------------------------

create table public.patient_code_counters (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.next_patient_public_code(org_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  next_value bigint;
begin
  insert into public.patient_code_counters (organization_id, last_value)
  values (org_id, 1)
  on conflict (organization_id)
  do update set
    last_value = public.patient_code_counters.last_value + 1,
    updated_at = now()
  returning last_value into next_value;

  return 'PAC-' || lpad(next_value::text, 3, '0');
end;
$$;

revoke all on function public.next_patient_public_code(uuid) from public;

-- No GRANT to anon/authenticated and RLS enabled with zero policies: the
-- counter is reachable only through the SECURITY DEFINER function above.
alter table public.patient_code_counters enable row level security;

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  -- Always assigned by the BEFORE INSERT trigger below; a client-supplied
  -- value is discarded, never trusted as authority.
  public_code text not null,
  preferred_name text not null
    check (length(btrim(preferred_name)) between 1 and 160),
  full_name text not null check (length(btrim(full_name)) between 1 and 200),
  birth_date date check (birth_date is null or birth_date <= current_date),
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  phone text,
  email text,
  -- Array of { name, relationship, phone, email? }, validated by Zod at the
  -- server boundary (src/features/patients/contracts.ts). Kept as jsonb
  -- because a guardian is not a first-class queryable entity in this phase.
  responsibles jsonb not null default '[]'::jsonb
    check (jsonb_typeof(responsibles) = 'array'),
  modality public.consultation_modality not null default 'in_person',
  status public.patient_status not null default 'active',
  default_session_value numeric(10, 2)
    check (default_session_value is null or default_session_value >= 0),
  responsible_psychologist_user_id uuid
    references auth.users (id) on delete set null,
  elimination_status public.patient_elimination_status not null default 'active',
  elimination_requested_at timestamptz,
  elimination_completed_at timestamptz,
  elimination_retained_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_organization_public_code_unique
    unique (organization_id, public_code)
);

comment on table public.patients is
  'Administrative patient record. No clinical content — see patient_clinical_profile.';

comment on column public.patients.public_code is
  'Assigned only by patients_assign_public_code trigger; immutable after insert.';

create index patients_organization_id_idx on public.patients (organization_id);
create index patients_organization_status_idx
  on public.patients (organization_id, status);

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- public_code assignment (BEFORE INSERT) and immutability (BEFORE UPDATE).

create or replace function public.assign_patient_public_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.public_code := public.next_patient_public_code(new.organization_id);
  return new;
end;
$$;

create trigger patients_assign_public_code
  before insert on public.patients
  for each row execute function public.assign_patient_public_code();

create or replace function public.prevent_patient_public_code_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.public_code is distinct from old.public_code then
    raise exception 'patients.public_code is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger patients_public_code_immutable
  before update on public.patients
  for each row execute function public.prevent_patient_public_code_update();

-- responsible_psychologist_user_id must name an active psychologist_admin of
-- the same organization, never an arbitrary user id.

create or replace function public.assert_valid_responsible_psychologist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsible_psychologist_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.responsible_psychologist_user_id
      and m.role = 'psychologist_admin'
      and m.active
  ) then
    raise exception 'responsible_psychologist_user_id must be an active psychologist_admin of the same organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger patients_assert_responsible_psychologist
  before insert or update on public.patients
  for each row execute function public.assert_valid_responsible_psychologist();

-- Only psychologist_admin may move elimination_status: this is the start of
-- the Phase 12 LGPD flow, and the secretary matrix grants no authority over
-- it even though it shares the `patients` row with fields secretaries can
-- otherwise write.

create or replace function public.assert_elimination_status_admin_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.elimination_status is distinct from old.elimination_status
     and not public.is_psychologist_admin(new.organization_id) then
    raise exception 'only psychologist_admin may change elimination_status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger patients_assert_elimination_status_admin_only
  before update on public.patients
  for each row execute function public.assert_elimination_status_admin_only();

-- ---------------------------------------------------------------------------
-- patient_clinical_profile — psychologist_admin only, always.
-- ---------------------------------------------------------------------------

create table public.patient_clinical_profile (
  patient_id uuid primary key
    references public.patients (id) on delete cascade,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  chief_complaint text,
  history text,
  therapy_goals text,
  schemas text,
  core_beliefs text,
  general_clinical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patient_clinical_profile is
  'Clinical content, kept out of the administrative patients table. Secretary has no SELECT policy here — ever.';

create trigger patient_clinical_profile_set_updated_at
  before update on public.patient_clinical_profile
  for each row execute function public.set_updated_at();

-- organization_id always mirrors the parent patient's tenant: a client can
-- never point a clinical profile at a different organization than its
-- patient, even if RLS on `patients` would otherwise let the write through.
create or replace function public.sync_patient_clinical_profile_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  select organization_id into patient_org
  from public.patients
  where id = new.patient_id;

  if patient_org is null then
    raise exception 'patient not found' using errcode = '23503';
  end if;

  new.organization_id := patient_org;
  return new;
end;
$$;

create trigger patient_clinical_profile_sync_org
  before insert or update on public.patient_clinical_profile
  for each row execute function public.sync_patient_clinical_profile_org();

-- ---------------------------------------------------------------------------
-- Audit helper: records a patient-scoped audit event with the patient's
-- public_code as resource_id (never the internal uuid, so audit logs read
-- the same way the UI does), while still enforcing the same actor/membership
-- rules as public.log_audit_event().
-- ---------------------------------------------------------------------------

create or replace function public.log_patient_audit_event(
  patient_id uuid,
  action text,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target_code text;
begin
  select organization_id, public_code
  into target_org, target_code
  from public.patients
  where id = patient_id;

  if target_org is null then
    raise exception 'patient not found' using errcode = '23503';
  end if;

  return public.log_audit_event(target_org, action, 'patient', target_code, metadata);
end;
$$;

revoke all on function public.log_patient_audit_event(uuid, text, jsonb) from public;
grant execute on function public.log_patient_audit_event(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update on public.patients to authenticated;
grant select, insert, update on public.patient_clinical_profile to authenticated;
-- No DELETE grant on either table: patients are archived/eliminated through
-- status transitions and the Phase 12 LGPD flow, never hard-deleted.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.patients enable row level security;
alter table public.patient_clinical_profile enable row level security;

-- patients: any active member of the organization has full CRUD (minus
-- DELETE, which has no policy at all). This matches the matrix in
-- docs/05-security-rbac-rls.md — the secretary's restriction is scoped to
-- clinical tables, not this administrative one.
create policy patients_select_members
  on public.patients
  for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy patients_insert_members
  on public.patients
  for insert
  to authenticated
  with check (public.is_org_member(organization_id));

create policy patients_update_members
  on public.patients
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- patient_clinical_profile: psychologist_admin only, full stop. There is no
-- secretary policy of any kind here — not SELECT, not INSERT, not UPDATE.
create policy patient_clinical_profile_all_admin
  on public.patient_clinical_profile
  for all
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
