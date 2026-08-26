-- Tesseli — apply once on the hosted Supabase project via SQL Editor.
-- Source of truth remains supabase/migrations/*.sql (run in this order).
-- Do not commit secrets. Vault values stay in the dashboard.


-- ========== 20260819231723_tenancy_core.sql ==========

-- Tesseli — Phase 2: tenancy, RBAC, RLS and audit trail.
-- Specs: docs/04-data-model.md (§Núcleo tenancy/auth), docs/05-security-rbac-rls.md.
--
-- Enforcement model:
--   * every tenant table carries organization_id and has RLS enabled;
--   * authorization derives from an active membership of auth.uid(), never from
--     a client-supplied organization id and never from members[0];
--   * secretaries have no access to settings/team/audit surfaces;
--   * audit_events is append-only for every application role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.organization_status as enum ('active', 'suspended');

create type public.organization_role as enum ('psychologist_admin', 'secretary');

create type public.secretary_finance_access as enum ('none', 'view', 'manage');

create type public.transcript_retention_policy as enum (
  'with_clinical_record',
  'fixed_days'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone text not null default 'America/Sao_Paulo'
    check (length(btrim(timezone)) > 0),
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'Tenant root. Created only through public.bootstrap_organization().';

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_active_idx
  on public.organization_members (user_id)
  where active;

create index organization_members_organization_id_idx
  on public.organization_members (organization_id);

create table public.practice_settings (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  professional_name text,
  subtitle text,
  crp text,
  tax_id text,
  pix_key text,
  clinic_name text,
  company_name text,
  greeting_prefix text,
  quote text,
  session_duration_minutes integer not null default 50
    check (session_duration_minutes between 10 and 480),
  monthly_goal numeric(12, 2) check (monthly_goal is null or monthly_goal >= 0),
  photo_path text,
  signature_path text,
  inactivity_timeout_minutes integer not null default 15
    check (inactivity_timeout_minutes between 1 and 240),
  secretary_finance_access public.secretary_finance_access not null
    default 'none',
  session_audio_fallback_retention_days integer not null default 7
    check (session_audio_fallback_retention_days between 1 and 90),
  transcript_retention_policy public.transcript_retention_policy not null
    default 'with_clinical_record',
  transcript_retention_fixed_days integer
    check (
      transcript_retention_fixed_days is null
      or transcript_retention_fixed_days >= 1
    ),
  clinical_record_minimum_retention_years integer not null default 5
    check (clinical_record_minimum_retention_years >= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_settings_transcript_retention_coherent check (
    (
      transcript_retention_policy = 'fixed_days'
      and transcript_retention_fixed_days is not null
    )
    or (
      transcript_retention_policy = 'with_clinical_record'
      and transcript_retention_fixed_days is null
    )
  )
);

comment on column public.practice_settings.secretary_finance_access is
  'Database-enforced finance permission for secretaries (docs/05-security-rbac-rls.md). Never a UI-only toggle.';

comment on column public.practice_settings.clinical_record_minimum_retention_years is
  'Minimum clinical record retention. Cannot be lowered below the professional-norm floor (docs/19-lgpd-privacy.md).';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (length(btrim(action)) between 1 and 120),
  resource_type text not null check (length(btrim(resource_type)) between 1 and 120),
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_organization_id_created_at_idx
  on public.audit_events (organization_id, created_at desc);

comment on table public.audit_events is
  'Append-only audit trail. No application role may UPDATE or DELETE; corrections are new events.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

create trigger practice_settings_set_updated_at
  before update on public.practice_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership / role helpers
--
-- SECURITY DEFINER is required so policies can read organization_members
-- without recursing into that table's own policies. Contract from
-- docs/05-security-rbac-rls.md: stable, empty search_path, schema-qualified,
-- auth.uid() resolved internally (never a client-supplied user id), minimal
-- EXECUTE grants.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.active
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.active
      and m.role::text = any (allowed_roles)
  );
$$;

create or replace function public.is_psychologist_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_org_role(org_id, array['psychologist_admin']);
$$;

-- Reads only practice_settings.secretary_finance_access, and only for an
-- organization the caller actually belongs to. Admins are unconstrained by
-- this setting, so they always resolve to 'manage'.
create or replace function public.secretary_finance_access(org_id uuid)
returns public.secretary_finance_access
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.is_org_member(org_id) then null
    when public.is_psychologist_admin(org_id) then 'manage'::public.secretary_finance_access
    else coalesce(
      (
        select s.secretary_finance_access
        from public.practice_settings s
        where s.organization_id = org_id
      ),
      'none'::public.secretary_finance_access
    )
  end;
$$;

-- Minimized settings projection every active member may read (shell needs the
-- professional/clinic label and the inactivity timeout). The table itself stays
-- admin-only, so secretaries never receive administrative/financial settings.
create or replace function public.organization_shell_settings(org_id uuid)
returns table (
  organization_id uuid,
  organization_name text,
  timezone text,
  professional_name text,
  clinic_name text,
  inactivity_timeout_minutes integer,
  session_duration_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.name,
    o.timezone,
    s.professional_name,
    s.clinic_name,
    s.inactivity_timeout_minutes,
    s.session_duration_minutes
  from public.organizations o
  left join public.practice_settings s on s.organization_id = o.id
  where o.id = org_id
    and public.is_org_member(org_id);
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
revoke all on function public.is_psychologist_admin(uuid) from public;
revoke all on function public.secretary_finance_access(uuid) from public;
revoke all on function public.organization_shell_settings(uuid) from public;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.is_psychologist_admin(uuid) to authenticated;
grant execute on function public.secretary_finance_access(uuid) to authenticated;
grant execute on function public.organization_shell_settings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit writer
--
-- Direct INSERT into audit_events is not granted to any application role, so
-- the trail cannot be forged with another actor or another organization.
-- ---------------------------------------------------------------------------

create or replace function public.log_audit_event(
  org_id uuid,
  action text,
  resource_type text,
  resource_id text default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'audit event requires an authenticated actor'
      using errcode = '42501';
  end if;

  if not public.is_org_member(org_id) then
    raise exception 'audit event requires an active membership'
      using errcode = '42501';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    org_id, auth.uid(), action, resource_type, resource_id,
    coalesce(metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.log_audit_event(uuid, text, text, text, jsonb) from public;
grant execute on function public.log_audit_event(uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Organization bootstrap
--
-- An organization with no members would be unreachable through RLS, so the
-- organization, the founding psychologist_admin membership, its settings row
-- and the audit event are created in one transaction.
-- ---------------------------------------------------------------------------

create or replace function public.bootstrap_organization(
  org_name text,
  org_slug text,
  professional_name text default null,
  org_timezone text default 'America/Sao_Paulo'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'organization bootstrap requires an authenticated user'
      using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, timezone)
  values (btrim(org_name), lower(btrim(org_slug)), coalesce(nullif(btrim(org_timezone), ''), 'America/Sao_Paulo'))
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (new_org_id, actor, 'psychologist_admin', true);

  insert into public.practice_settings (organization_id, professional_name)
  values (new_org_id, nullif(btrim(coalesce(professional_name, '')), ''));

  insert into public.audit_events (
    organization_id, actor_user_id, action, resource_type, resource_id
  )
  values (
    new_org_id, actor, 'organization.bootstrap', 'organization',
    new_org_id::text
  );

  return new_org_id;
end;
$$;

revoke all on function public.bootstrap_organization(text, text, text, text) from public;
grant execute on function public.bootstrap_organization(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Last-admin protection
-- ---------------------------------------------------------------------------

create or replace function public.assert_organization_keeps_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid := coalesce(old.organization_id, new.organization_id);
  remaining integer;
begin
  select count(*)
  into remaining
  from public.organization_members m
  where m.organization_id = target_org
    and m.active
    and m.role = 'psychologist_admin'
    and m.id <> old.id;

  if tg_op = 'UPDATE'
     and new.active
     and new.role = 'psychologist_admin' then
    return new;
  end if;

  if remaining = 0 then
    raise exception 'organization must keep at least one active psychologist_admin'
      using errcode = '23514';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger organization_members_keep_admin
  before update or delete on public.organization_members
  for each row execute function public.assert_organization_keeps_admin();

-- ---------------------------------------------------------------------------
-- Grants: RLS is the row gate, but privileges still have to be explicit.
-- `anon` receives nothing on tenant tables.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.organizations to authenticated;
grant update on public.organizations to authenticated;

grant select, insert, update, delete on public.organization_members to authenticated;

grant select, update on public.practice_settings to authenticated;

grant select on public.audit_events to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.practice_settings enable row level security;
alter table public.audit_events enable row level security;

-- organizations: members read; only admins update. No INSERT/DELETE policy:
-- creation goes through bootstrap_organization(), deletion is a Phase 12
-- risk-zone flow that does not exist yet.
create policy organizations_select_members
  on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

create policy organizations_update_admin
  on public.organizations
  for update
  to authenticated
  using (public.is_psychologist_admin(id))
  with check (public.is_psychologist_admin(id));

-- organization_members: a user always sees their own memberships (needed to
-- resolve the active organization); team management is admin-only, which is
-- also why secretaries cannot enumerate the team.
create policy organization_members_select_self_or_admin
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_psychologist_admin(organization_id)
  );

create policy organization_members_insert_admin
  on public.organization_members
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy organization_members_update_admin
  on public.organization_members
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

create policy organization_members_delete_admin
  on public.organization_members
  for delete
  to authenticated
  using (public.is_psychologist_admin(organization_id));

-- practice_settings: admin-only surface. Members read the minimized
-- projection through public.organization_shell_settings() instead.
create policy practice_settings_select_admin
  on public.practice_settings
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy practice_settings_update_admin
  on public.practice_settings
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- audit_events: admins read their own organization's trail. There is
-- deliberately no INSERT/UPDATE/DELETE policy — writes go through
-- public.log_audit_event() and the trail is append-only.
create policy audit_events_select_admin
  on public.audit_events
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ========== 20260820001825_patients.sql ==========

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
  photo_path text,
  responsible_psychologist_user_id uuid
    references auth.users (id) on delete set null,
  elimination_status public.patient_elimination_status not null default 'active',
  elimination_requested_at timestamptz,
  elimination_completed_at timestamptz,
  elimination_retained_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_organization_public_code_unique
    unique (organization_id, public_code),
  constraint patients_photo_path_tenant_prefix check (
    photo_path is null
    or photo_path like (organization_id::text || '/' || id::text || '/%')
  )
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

-- ========== 20260820012522_google_calendar.sql ==========

-- Tesseli — Phase 4: Google Calendar connection + Agenda appointments + Meet.
-- Specs: docs/04-data-model.md (§Agenda), docs/06-integrations.md §1,
-- docs/05-security-rbac-rls.md (§Tokens Google), prompts/04-agenda-google.md.
--
-- Design decisions made for this phase (not fully pinned down by the docs):
--   * one Google connection per organization (docs describe Settings showing
--     a single connected/disconnected state, not a per-professional list);
--   * OAuth tokens are split into their own zero-grant table
--     (google_calendar_credentials) so that even an authenticated admin
--     session can never SELECT the encrypted refresh token through the Data
--     API — only SECURITY DEFINER RPCs (called from server-only Node code,
--     which does the actual AES-GCM decryption) can reach it. This is the
--     same "RLS + zero policies" pattern already used for
--     patient_code_counters, and avoids introducing a service-role
--     consumer for what is otherwise a narrow, well-scoped need;
--   * connecting/disconnecting Google is an admin-only action (it is
--     effectively an integration/settings action, matching the
--     "settings/security/team: secretary NENHUM" row of the RBAC matrix),
--     but calendar_id *selection* and appointment CRUD stay open to both
--     roles per "calendar sync | CRUD | CRUD permitido";
--   * `meet_status`/`meet_request_id` are not explicitly listed in
--     docs/04-data-model.md's `appointments` columns, but are required to
--     implement the pending/success/failure Meet lifecycle mandated by
--     docs/06-integrations.md §1 and prompts/04-agenda-google.md.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.google_connection_status as enum (
  'connected',
  'disconnected',
  'error'
);

create type public.appointment_origin as enum ('TESSELI', 'GOOGLE_EXTERNAL');

create type public.appointment_status as enum (
  'scheduled',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

create type public.calendar_sync_policy as enum ('managed', 'read_only');

create type public.meet_creation_status as enum (
  'none',
  'pending',
  'success',
  'failure'
);

create type public.calendar_sync_direction as enum ('push', 'pull');

-- ---------------------------------------------------------------------------
-- google_calendar_connections — non-secret connection metadata.
-- ---------------------------------------------------------------------------

create table public.google_calendar_connections (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  status public.google_connection_status not null default 'disconnected',
  google_account_email text,
  calendar_id text,
  calendar_summary text,
  scopes text[] not null default array[]::text[],
  last_synced_at timestamptz,
  last_sync_error text,
  connected_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_connections is
  'Non-secret Google Calendar connection state. Tokens live in google_calendar_credentials, never here.';

create trigger google_calendar_connections_set_updated_at
  before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- google_calendar_credentials — encrypted tokens, reachable only through
-- SECURITY DEFINER RPCs. RLS is enabled with zero policies and there is no
-- GRANT to anon/authenticated: the Data API can never return a row from this
-- table to any client, admin included.
-- ---------------------------------------------------------------------------

create table public.google_calendar_credentials (
  organization_id uuid primary key
    references public.organizations (id) on delete cascade,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_credentials is
  'AES-GCM-encrypted OAuth tokens (encryption/decryption happens in Node, GOOGLE_TOKEN_ENCRYPTION_KEY). No role has a GRANT on this table; access is exclusively through get/upsert/disconnect_google_credentials().';

alter table public.google_calendar_credentials enable row level security;

create or replace function public.credentials_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger google_calendar_credentials_set_updated_at
  before update on public.google_calendar_credentials
  for each row execute function public.credentials_set_updated_at();

-- Admin-only: establishes or refreshes the connection's tokens + status in
-- one transaction. Called right after the OAuth code exchange, and again on
-- every silent access-token refresh.
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
begin
  if not public.is_psychologist_admin(org_id) then
    raise exception 'only psychologist_admin may connect Google Calendar'
      using errcode = '42501';
  end if;

  insert into public.google_calendar_credentials (
    organization_id, access_token_encrypted, access_token_expires_at,
    refresh_token_encrypted
  )
  values (org_id, p_access_token_encrypted, p_access_token_expires_at, p_refresh_token_encrypted)
  on conflict (organization_id) do update set
    access_token_encrypted = excluded.access_token_encrypted,
    access_token_expires_at = excluded.access_token_expires_at,
    -- A refresh call may legitimately omit a new refresh_token (Google only
    -- issues one on first consent/prompt=consent) — keep the existing one.
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, public.google_calendar_credentials.refresh_token_encrypted),
    updated_at = now();

  insert into public.google_calendar_connections (
    organization_id, status, google_account_email, scopes, connected_by_user_id
  )
  values (
    org_id, 'connected', p_google_account_email,
    coalesce(p_scopes, array[]::text[]), auth.uid()
  )
  on conflict (organization_id) do update set
    status = 'connected',
    google_account_email = coalesce(excluded.google_account_email, public.google_calendar_connections.google_account_email),
    scopes = case
      when p_scopes is not null then excluded.scopes
      else public.google_calendar_connections.scopes
    end,
    last_sync_error = null;
end;
$$;

-- Any active member may read the (still-encrypted) credentials to perform a
-- token refresh on behalf of the organization — reading an encrypted blob is
-- no more sensitive than the calendar data itself; only decryption (Node,
-- GOOGLE_TOKEN_ENCRYPTION_KEY) makes it usable, and only server code holds
-- that key.
create or replace function public.get_google_credentials(org_id uuid)
returns table (
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  refresh_token_encrypted text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.access_token_encrypted, c.access_token_expires_at, c.refresh_token_encrypted
  from public.google_calendar_credentials c
  where c.organization_id = org_id
    and public.is_org_member(org_id);
$$;

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
      calendar_id = null,
      calendar_summary = null,
      last_sync_error = null
  where organization_id = org_id;
end;
$$;

revoke all on function public.upsert_google_credentials(uuid, text, timestamptz, text, text, text[]) from public;
revoke all on function public.get_google_credentials(uuid) from public;
revoke all on function public.disconnect_google_calendar(uuid) from public;
grant execute on function public.upsert_google_credentials(uuid, text, timestamptz, text, text, text[]) to authenticated;
grant execute on function public.get_google_credentials(uuid) to authenticated;
grant execute on function public.disconnect_google_calendar(uuid) to authenticated;

grant select, update on public.google_calendar_connections to authenticated;

alter table public.google_calendar_connections enable row level security;

create policy google_calendar_connections_select_members
  on public.google_calendar_connections
  for select
  to authenticated
  using (public.is_org_member(organization_id));

-- Only calendar_id/calendar_summary selection is meant to go through this
-- UPDATE policy; status/tokens are only ever changed by the RPCs above. Both
-- roles may pick which already-connected calendar to use for scheduling.
create policy google_calendar_connections_update_members
  on public.google_calendar_connections
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  modality public.consultation_modality not null default 'in_person',
  origin public.appointment_origin not null default 'TESSELI',
  managed_by_tesseli boolean not null default true,
  sync_policy public.calendar_sync_policy not null default 'managed',
  google_calendar_id text,
  google_event_id text,
  google_etag text,
  meet_url text,
  meet_status public.meet_creation_status not null default 'none',
  meet_request_id text,
  summary_snapshot text,
  sync_status text not null default 'synced',
  last_synced_at timestamptz,
  -- Set by the client on create/reschedule so a retried request (double
  -- click, network retry) can never create a second appointment.
  create_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_ends_after_starts check (ends_at > starts_at),
  constraint appointments_origin_consistency check (
    (origin = 'TESSELI' and sync_policy = 'managed')
    or (origin = 'GOOGLE_EXTERNAL' and sync_policy = 'read_only' and managed_by_tesseli = false)
  ),
  constraint appointments_google_event_unique
    unique (organization_id, google_calendar_id, google_event_id),
  constraint appointments_idempotency_unique
    unique (organization_id, create_idempotency_key)
);

comment on column public.appointments.summary_snapshot is
  'Denormalized "Nome Sobrenome • PAC-###" snapshot for display without a patient join; not the source of truth for the name.';

create index appointments_organization_starts_at_idx
  on public.appointments (organization_id, starts_at);
create index appointments_patient_id_idx on public.appointments (patient_id);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- patient_id must belong to the same organization as the appointment.
create or replace function public.assert_appointment_patient_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  if new.patient_id is null then
    return new;
  end if;

  select organization_id into patient_org
  from public.patients
  where id = new.patient_id;

  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'appointment patient must belong to the same organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger appointments_assert_patient_same_org
  before insert or update on public.appointments
  for each row execute function public.assert_appointment_patient_same_org();

grant select, insert, update, delete on public.appointments to authenticated;

alter table public.appointments enable row level security;

create policy appointments_select_members
  on public.appointments
  for select
  to authenticated
  using (public.is_org_member(organization_id));

-- Regular (non-RPC) writes are only ever allowed on Tesseli-managed rows:
-- a Google-imported event is read-only for every application role. Pulling
-- external events into this table happens exclusively through
-- upsert_external_appointment(), a SECURITY DEFINER function that bypasses
-- this restriction under its own membership check.
create policy appointments_insert_managed
  on public.appointments
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and origin = 'TESSELI'
  );

create policy appointments_update_managed
  on public.appointments
  for update
  to authenticated
  using (
    public.is_org_member(organization_id)
    and origin = 'TESSELI'
  )
  with check (
    public.is_org_member(organization_id)
    and origin = 'TESSELI'
  );

create policy appointments_delete_managed
  on public.appointments
  for delete
  to authenticated
  using (
    public.is_org_member(organization_id)
    and origin = 'TESSELI'
  );

-- Pull-sync path: upserts a GOOGLE_EXTERNAL row by (organization_id,
-- google_calendar_id, google_event_id). Never touches TESSELI rows, so a
-- managed appointment can never be silently overwritten by an external sync.
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
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
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

revoke all on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status) from public;
grant execute on function public.upsert_external_appointment(uuid, text, text, text, timestamptz, timestamptz, text, public.appointment_status) to authenticated;

-- ---------------------------------------------------------------------------
-- calendar_sync_events — write intent/result audit, no clinical content.
-- ---------------------------------------------------------------------------

create table public.calendar_sync_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  direction public.calendar_sync_direction not null,
  action text not null check (length(btrim(action)) between 1 and 80),
  request_payload jsonb not null default '{}'::jsonb,
  response_status text,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.calendar_sync_events is
  'Sync/write audit for Calendar/Meet. request_payload is structural only (ids/times), never clinical content.';

create index calendar_sync_events_organization_created_at_idx
  on public.calendar_sync_events (organization_id, created_at desc);

grant select on public.calendar_sync_events to authenticated;

alter table public.calendar_sync_events enable row level security;

create policy calendar_sync_events_select_admin
  on public.calendar_sync_events
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

-- No INSERT/UPDATE/DELETE policy for any role: writes go exclusively through
-- log_calendar_sync_event(), same append-only shape as audit_events.
create or replace function public.log_calendar_sync_event(
  org_id uuid,
  direction public.calendar_sync_direction,
  action text,
  appointment_id uuid default null,
  request_payload jsonb default '{}'::jsonb,
  response_status text default null,
  error_message text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_org_member(org_id) then
    raise exception 'calendar sync event requires an active membership'
      using errcode = '42501';
  end if;

  insert into public.calendar_sync_events (
    organization_id, appointment_id, direction, action, request_payload,
    response_status, error_message
  )
  values (
    org_id, appointment_id, direction, action, coalesce(request_payload, '{}'::jsonb),
    response_status, error_message
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.log_calendar_sync_event(uuid, public.calendar_sync_direction, text, uuid, jsonb, text, text) from public;
grant execute on function public.log_calendar_sync_event(uuid, public.calendar_sync_direction, text, uuid, jsonb, text, text) to authenticated;

-- ========== 20260820023552_practice_tasks.sql ==========

-- Tesseli — Phase 5: practice_tasks for the Meu Dia operational dashboard.
-- Specs: docs/01-product-spec.md §4, docs/08-implementation-phases.md Fase 5,
-- prompts/05-myday.md.
--
-- Tasks are a lightweight operational list (not clinical content). Both
-- psychologist_admin and secretary have full CRUD within their organization —
-- matching the "Meu Dia" operational nature of the screen.
--
-- Also extends organization_shell_settings() to surface greeting_prefix and
-- quote — non-sensitive personalization used by Meu Dia's greeting block.
-- Secretaries already read the shell projection; these two columns are not
-- administrative/financial settings and belong in the same minimized surface.

-- ---------------------------------------------------------------------------
-- practice_tasks
-- ---------------------------------------------------------------------------

create table public.practice_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  title text not null
    check (char_length(btrim(title)) between 1 and 200),
  notes text
    check (notes is null or char_length(notes) <= 2000),
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.practice_tasks is
  'Operational checklist for Meu Dia. Not clinical content — both roles have CRUD within the organization.';

create index practice_tasks_organization_open_idx
  on public.practice_tasks (organization_id, completed_at, due_at)
  where completed_at is null;

create trigger practice_tasks_set_updated_at
  before update on public.practice_tasks
  for each row execute function public.set_updated_at();

-- Stamp created_by from auth.uid() so a client cannot forge authorship.
create or replace function public.assert_practice_task_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by_user_id := old.created_by_user_id;
  end if;
  return new;
end;
$$;

create trigger practice_tasks_assert_created_by
  before insert or update on public.practice_tasks
  for each row execute function public.assert_practice_task_created_by();

grant select, insert, update, delete on public.practice_tasks to authenticated;

alter table public.practice_tasks enable row level security;

create policy practice_tasks_select_members
  on public.practice_tasks
  for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy practice_tasks_insert_members
  on public.practice_tasks
  for insert
  to authenticated
  with check (public.is_org_member(organization_id));

create policy practice_tasks_update_members
  on public.practice_tasks
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy practice_tasks_delete_members
  on public.practice_tasks
  for delete
  to authenticated
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Shell settings: expose greeting_prefix + quote for Meu Dia.
-- CREATE OR REPLACE cannot change a function's OUT columns, so drop first.
-- ---------------------------------------------------------------------------

drop function if exists public.organization_shell_settings(uuid);

create or replace function public.organization_shell_settings(org_id uuid)
returns table (
  organization_id uuid,
  organization_name text,
  timezone text,
  professional_name text,
  clinic_name text,
  inactivity_timeout_minutes integer,
  session_duration_minutes integer,
  greeting_prefix text,
  quote text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.name,
    o.timezone,
    s.professional_name,
    s.clinic_name,
    s.inactivity_timeout_minutes,
    s.session_duration_minutes,
    s.greeting_prefix,
    s.quote
  from public.organizations o
  left join public.practice_settings s on s.organization_id = o.id
  where o.id = org_id
    and public.is_org_member(org_id);
$$;

revoke all on function public.organization_shell_settings(uuid) from public;
grant execute on function public.organization_shell_settings(uuid) to authenticated;

-- ========== 20260820025300_consents.sql ==========

-- Tesseli — Phase 5.5: minimal consent records (prerequisite for Phase 6).
-- Specs: docs/04-data-model.md §Consentimentos, docs/08-implementation-phases.md
-- Fase 5.5, docs/16-runtime-ai-data-contracts.md §ConsentState,
-- docs/05-security-rbac-rls.md, docs/19-lgpd-privacy.md.
--
-- Scope is deliberately reduced: this migration only creates the consent
-- *record* that the clinical-capture gate needs. The full TCLE flow
-- (templates, PDF, signatures, consent_files) stays in Phase 9.
--
-- Design decisions taken here (not fully pinned down by the docs):
--   * the full `type` vocabulary from docs/04-data-model.md is created, but
--     only ai_processing / session_recording / session_transcription are
--     consumed by this phase;
--   * consent history is append-only in practice: there is no DELETE policy
--     for any role. Revoking is a status transition, never an erasure —
--     otherwise a revoked consent could be made to disappear from the record;
--   * recording/revoking a *clinical* consent is a psychologist_admin action.
--     The secretary may only read the administrative-ish types, mirroring the
--     "documents: secretary only sensitivity='administrative'" row of the RBAC
--     matrix. Classification fails closed: unknown/other counts as clinical;
--   * `accepted_ip_hash` stores a hash, never the raw IP
--     (docs/04-data-model.md allows "accepted_ip ou hash/política aprovada").

create type public.consent_type as enum (
  'service_terms',
  'psychotherapy',
  'ai_processing',
  'session_recording',
  'session_transcription',
  'whatsapp',
  'other'
);

create type public.consent_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

-- Immutable so it can be used inside RLS policies without extra planning cost.
-- Fails closed: anything not explicitly administrative is treated as clinical.
create or replace function public.consent_type_is_administrative(
  consent_type public.consent_type
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select consent_type in ('service_terms', 'whatsapp');
$$;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  patient_id uuid not null
    references public.patients (id) on delete cascade,
  type public.consent_type not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  version text not null check (char_length(btrim(version)) between 1 and 40),
  status public.consent_status not null default 'pending',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_ip_hash text,
  expires_at timestamptz,
  -- Applicable only when the patient is a minor; see
  -- src/features/consents/contracts.ts for the age rules that consume them.
  guardian_authorization boolean not null default false,
  guardian_name text,
  patient_assent boolean not null default false,
  signature_path text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consents_accepted_has_timestamp check (
    status <> 'accepted' or accepted_at is not null
  ),
  constraint consents_revoked_has_timestamp check (
    status <> 'revoked' or revoked_at is not null
  )
);

comment on table public.consents is
  'Minimal consent record backing the Phase 6 capture gate. Revocation is a status transition; rows are never deleted.';
comment on column public.consents.accepted_ip_hash is
  'Hash of the acceptance IP, never the raw address (docs/19-lgpd-privacy.md).';

create index consents_lookup_idx
  on public.consents (organization_id, patient_id, type, created_at desc);

create trigger consents_set_updated_at
  before update on public.consents
  for each row execute function public.set_updated_at();

-- patient_id must belong to the same organization as the consent.
create or replace function public.assert_consent_patient_same_org()
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

  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'consent patient must belong to the same organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger consents_assert_patient_same_org
  before insert or update on public.consents
  for each row execute function public.assert_consent_patient_same_org();

-- Authorship/timestamps of acceptance and revocation are stamped from
-- auth.uid()/now(), never accepted from the client: a consent record whose
-- author could be forged would be worthless as evidence.
create or replace function public.assert_consent_authorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' then
    if tg_op = 'INSERT' or old.status is distinct from 'accepted' then
      new.accepted_at := now();
      new.accepted_by := auth.uid();
    else
      new.accepted_at := old.accepted_at;
      new.accepted_by := old.accepted_by;
    end if;
  end if;

  if new.status = 'revoked' then
    if tg_op = 'INSERT' or old.status is distinct from 'revoked' then
      new.revoked_at := now();
      new.revoked_by := auth.uid();
    else
      new.revoked_at := old.revoked_at;
      new.revoked_by := old.revoked_by;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- A recorded acceptance is historical fact: it cannot be re-pointed at a
    -- different patient/type/version after the fact.
    new.patient_id := old.patient_id;
    new.organization_id := old.organization_id;
    new.type := old.type;
    new.version := old.version;

    -- Once revoked, a consent never returns to accepted; record a new one.
    if old.status = 'revoked' and new.status <> 'revoked' then
      raise exception 'a revoked consent cannot be reactivated; record a new consent'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger consents_assert_authorship
  before insert or update on public.consents
  for each row execute function public.assert_consent_authorship();

grant select, insert, update on public.consents to authenticated;

alter table public.consents enable row level security;

create policy consents_select_admin_or_administrative
  on public.consents
  for select
  to authenticated
  using (
    public.is_psychologist_admin(organization_id)
    or (
      public.is_org_member(organization_id)
      and public.consent_type_is_administrative(type)
    )
  );

create policy consents_insert_admin
  on public.consents
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy consents_update_admin
  on public.consents
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- No DELETE policy on purpose: consent history is not erasable.

revoke all on function public.consent_type_is_administrative(public.consent_type) from public;
grant execute on function public.consent_type_is_administrative(public.consent_type) to authenticated;

-- ========== 20260820131712_clinical_sessions.sql ==========

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

-- ========== 20260820143355_supervisor_ai.sql ==========

-- Tesseli — Phase 7: Supervisor Clínico IA.
--
-- No new tables: "histórico de supervisões" (docs/01 §8) is the existing
-- ai_runs/ai_artifacts pair from Phase 6, which already carries
-- patient_id/prompt_version/schema_version/model per execution — a
-- dedicated `supervisor_sessions` table would just duplicate that. The
-- run's `source_ids` jsonb records which clinical sessions were selected
-- as input for a given supervision.
--
-- The only schema change is widening the purpose/type vocabulary that
-- Phase 6 deliberately left extensible (see that migration's header
-- comment) to admit 'supervisor'.

alter table public.ai_runs drop constraint ai_runs_purpose_check;
alter table public.ai_runs add constraint ai_runs_purpose_check
  check (purpose in ('session_live', 'session_preparation', 'session_closing', 'supervisor'));

alter table public.ai_artifacts drop constraint ai_artifacts_type_check;
alter table public.ai_artifacts add constraint ai_artifacts_type_check
  check (type in ('session_live', 'session_preparation', 'session_closing', 'supervisor'));

-- ========== 20260820150121_knowledge_rag.sql ==========

-- Tesseli — Phase 8: Conhecimento Tesseli / RAG local.
--
-- Design decisions not fully pinned down by the docs:
--   * "knowledge clinical" in docs/05-security-rbac-rls.md gives the
--     secretary NENHUM on the whole module — every table here is
--     psychologist_admin-only, the same boundary as Session AI/Supervisor;
--   * knowledge_sources (bibliographic metadata + file + ingestion status)
--     is kept separate from knowledge_documents (the extracted plain text)
--     so re-extracting/re-chunking a source never touches its citation
--     metadata, and a source can exist in 'uploaded'/'failed' status with
--     no document yet;
--   * embeddings are vector(768) — Gemini's embedding models default to
--     3072 dims but explicitly recommend truncating via
--     `outputDimensionality` to 768/1536/3072 with "little loss in
--     quality" (ai.google.dev/gemini-api/docs/embeddings, checked
--     2026-08-20); 768 is the smallest recommended size, keeping index
--     size/query cost down for a single-tenant-at-a-time library;
--   * ai_runs/ai_artifacts (Fase 6) get their purpose/type vocabulary
--     widened again, same mechanism as Fase 7's migration.

create extension if not exists vector;

create type public.knowledge_source_status as enum (
  'uploaded',
  'processing',
  'ready',
  'failed'
);

-- ---------------------------------------------------------------------------
-- knowledge_collections
-- ---------------------------------------------------------------------------

create table public.knowledge_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger knowledge_collections_set_updated_at
  before update on public.knowledge_collections
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.knowledge_collections to authenticated;
alter table public.knowledge_collections enable row level security;

create policy knowledge_collections_admin_select
  on public.knowledge_collections for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_collections_admin_insert
  on public.knowledge_collections for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_collections_admin_update
  on public.knowledge_collections for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_collections_admin_delete
  on public.knowledge_collections for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_sources
-- ---------------------------------------------------------------------------

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  collection_id uuid references public.knowledge_collections (id) on delete set null,
  -- Bibliographic metadata: every field nullable/empty-array on purpose —
  -- docs/16 "Nunca invente fonte, página, capítulo, autor..."; absence is
  -- the correct default, not a placeholder to be filled by inference.
  title text,
  authors text[] not null default '{}',
  year integer,
  edition text,
  document_type text,
  study_design_or_source_role text,
  language text,
  theoretical_approaches text[] not null default '{}',
  population_context text[] not null default '{}',
  main_topics text[] not null default '{}',
  system_tags text[] not null default '{}',
  status public.knowledge_source_status not null default 'uploaded',
  ingestion_error text,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_sources_org_idx on public.knowledge_sources (organization_id, created_at desc);

create trigger knowledge_sources_set_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

create or replace function public.assert_knowledge_source_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_org uuid;
begin
  if new.collection_id is not null then
    select organization_id into collection_org
    from public.knowledge_collections
    where id = new.collection_id;
    if collection_org is null or collection_org <> new.organization_id then
      raise exception 'knowledge source collection must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.uploaded_by := old.uploaded_by;
    new.organization_id := old.organization_id;
    new.storage_path := old.storage_path;
    new.sha256 := old.sha256;
  end if;

  return new;
end;
$$;

create trigger knowledge_sources_assert_consistency
  before insert or update on public.knowledge_sources
  for each row execute function public.assert_knowledge_source_consistency();

grant select, insert, update, delete on public.knowledge_sources to authenticated;
alter table public.knowledge_sources enable row level security;

create policy knowledge_sources_admin_select
  on public.knowledge_sources for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_sources_admin_insert
  on public.knowledge_sources for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_sources_admin_update
  on public.knowledge_sources for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_sources_admin_delete
  on public.knowledge_sources for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_documents (extracted text, 1:1 with a source)
-- ---------------------------------------------------------------------------

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null unique references public.knowledge_sources (id) on delete cascade,
  extracted_text text not null,
  char_count integer not null default 0,
  extracted_at timestamptz not null default now()
);

create or replace function public.assert_knowledge_document_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_org uuid;
begin
  select organization_id into source_org
  from public.knowledge_sources
  where id = new.source_id;
  if source_org is null or source_org <> new.organization_id then
    raise exception 'knowledge document organization must match its source'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger knowledge_documents_assert_same_org
  before insert or update on public.knowledge_documents
  for each row execute function public.assert_knowledge_document_same_org();

grant select, insert, update, delete on public.knowledge_documents to authenticated;
alter table public.knowledge_documents enable row level security;

create policy knowledge_documents_admin_select
  on public.knowledge_documents for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_documents_admin_insert
  on public.knowledge_documents for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_documents_admin_update
  on public.knowledge_documents for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_documents_admin_delete
  on public.knowledge_documents for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_chunks
-- ---------------------------------------------------------------------------

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  text text not null,
  char_start integer,
  char_end integer,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_unique_sequence unique (document_id, sequence)
);

create index knowledge_chunks_source_idx on public.knowledge_chunks (source_id);

create or replace function public.assert_knowledge_chunk_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_org uuid;
  doc_source uuid;
begin
  select organization_id, source_id into doc_org, doc_source
  from public.knowledge_documents
  where id = new.document_id;

  if doc_org is null or doc_org <> new.organization_id then
    raise exception 'knowledge chunk organization must match its document'
      using errcode = '23514';
  end if;
  if doc_source is distinct from new.source_id then
    raise exception 'knowledge chunk source must match its document''s source'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger knowledge_chunks_assert_consistency
  before insert or update on public.knowledge_chunks
  for each row execute function public.assert_knowledge_chunk_consistency();

-- Chunks are regenerated wholesale on re-ingestion, never edited in place —
-- INSERT/DELETE only, no UPDATE grant.
grant select, insert, delete on public.knowledge_chunks to authenticated;
alter table public.knowledge_chunks enable row level security;

create policy knowledge_chunks_admin_select
  on public.knowledge_chunks for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_chunks_admin_insert
  on public.knowledge_chunks for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_chunks_admin_delete
  on public.knowledge_chunks for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_embeddings
-- ---------------------------------------------------------------------------

create table public.knowledge_embeddings (
  chunk_id uuid primary key references public.knowledge_chunks (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  embedding vector(768) not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index knowledge_embeddings_vector_idx
  on public.knowledge_embeddings
  using hnsw (embedding vector_cosine_ops);

create or replace function public.assert_knowledge_embedding_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chunk_org uuid;
begin
  select organization_id into chunk_org
  from public.knowledge_chunks
  where id = new.chunk_id;
  if chunk_org is null or chunk_org <> new.organization_id then
    raise exception 'knowledge embedding organization must match its chunk'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger knowledge_embeddings_assert_same_org
  before insert or update on public.knowledge_embeddings
  for each row execute function public.assert_knowledge_embedding_same_org();

grant select, insert, delete on public.knowledge_embeddings to authenticated;
alter table public.knowledge_embeddings enable row level security;

create policy knowledge_embeddings_admin_select
  on public.knowledge_embeddings for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_embeddings_admin_insert
  on public.knowledge_embeddings for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_embeddings_admin_delete
  on public.knowledge_embeddings for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- Tenant-scoped vector similarity search. SECURITY INVOKER: the caller's
-- own RLS on knowledge_embeddings/knowledge_chunks/knowledge_sources is
-- what authorizes reading these rows — this function only adds the
-- pgvector ORDER BY/LIMIT that a plain PostgREST filter can't express.
create or replace function public.match_knowledge_chunks(
  org_id uuid,
  query_embedding vector(768),
  match_count integer default 8,
  collection_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  text text,
  char_start integer,
  char_end integer,
  similarity real
)
language sql
stable
security invoker
set search_path = ''
as -- `set search_path = ''` (this codebase's usual hardening for SQL/plpgsql
-- functions) means the infix `<=>`/`<->` operators pgvector registers
-- cannot be found unqualified — they need the explicit OPERATOR() syntax
-- to resolve without a search_path.
$$
  select
    c.id as chunk_id,
    c.source_id,
    c.text,
    c.char_start,
    c.char_end,
    1 - (e.embedding operator(public.<=>) query_embedding) as similarity
  from public.knowledge_embeddings e
  join public.knowledge_chunks c on c.id = e.chunk_id
  join public.knowledge_sources s on s.id = c.source_id
  where e.organization_id = org_id
    and (collection_ids is null or s.collection_id = any (collection_ids))
  order by e.embedding operator(public.<=>) query_embedding
  limit match_count;
$$;

revoke all on function public.match_knowledge_chunks(uuid, vector, integer, uuid[]) from public;
grant execute on function public.match_knowledge_chunks(uuid, vector, integer, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- knowledge-sources storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('knowledge-sources', 'knowledge-sources', false)
on conflict (id) do nothing;

-- Unlike session-audio-fallback, a direct RLS policy is the right tool here:
-- there is no separate consent gate to enforce, only "is this user the
-- psychologist_admin of the organization named in the path's first
-- segment" — exactly what Postgres RLS is for. Path convention:
-- knowledge-sources/{organization_id}/{source_id}/{filename}.
create policy knowledge_sources_storage_admin_all
  on storage.objects for all to authenticated
  using (
    bucket_id = 'knowledge-sources'
    and public.is_psychologist_admin((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'knowledge-sources'
    and public.is_psychologist_admin((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------------
-- ai_runs / ai_artifacts vocabulary widened for Knowledge (same mechanism
-- as Fase 7's migration)
-- ---------------------------------------------------------------------------

alter table public.ai_runs drop constraint ai_runs_purpose_check;
alter table public.ai_runs add constraint ai_runs_purpose_check
  check (purpose in (
    'session_live', 'session_preparation', 'session_closing', 'supervisor',
    'knowledge_query', 'knowledge_synthesis', 'knowledge_compare_sources',
    'knowledge_study_mode', 'knowledge_clinical_application', 'knowledge_ingestion'
  ));

alter table public.ai_artifacts drop constraint ai_artifacts_type_check;
alter table public.ai_artifacts add constraint ai_artifacts_type_check
  check (type in (
    'session_live', 'session_preparation', 'session_closing', 'supervisor',
    'knowledge_query', 'knowledge_synthesis', 'knowledge_compare_sources',
    'knowledge_study_mode', 'knowledge_clinical_application', 'knowledge_ingestion'
  ));

-- ========== 20260820153234_documents_tcle.sql ==========

-- Tesseli — Phase 9: Documentos + TCLE.
-- Specs: docs/04-data-model.md §Documentos, docs/05-security-rbac-rls.md,
-- docs/08-implementation-phases.md Fase 9, docs/19-lgpd-privacy.md.
--
-- Design decisions taken here (not fully pinned down by the docs):
--   * every Storage bucket this phase touches (clinical-documents,
--     patient-attachments, consents) gets zero grants for anon/authenticated,
--     same reasoning as session-audio-fallback (Fase 6): "documents:
--     secretary CRUD somente administrative" is a decision that depends on
--     a value (sensitivity) that either doesn't exist yet at upload time or
--     requires a join Storage RLS can't express cleanly — a service-role
--     signed URL, minted by TypeScript that already has the row and its
--     sensitivity in hand, is the right tool. "Links de download são signed
--     URLs de curta duração" (docs/05) applies to every bucket, not just
--     this one, so the same approach is used everywhere this phase writes;
--   * `document_files`/`patient_attachments` rows are inserted by
--     server-side code running as the caller's own session (not
--     SECURITY DEFINER) — the bytes are generated/received server-side,
--     but authorization is still the caller's own sensitivity+role, so
--     ordinary RLS INSERT policies (mirroring `documents`) are enough;
--   * `consent_files` mirrors `consents`' own administrative/clinical split
--     via `consent_type_is_administrative`, since a TCLE PDF is exactly as
--     sensitive as the consent record it proves.

create type public.document_kind as enum (
  'laudo', 'relatorio', 'atestado', 'declaracao', 'encaminhamento',
  'recibo', 'tcle', 'contrato', 'branco', 'outro'
);

create type public.document_sensitivity as enum ('administrative', 'clinical');

create type public.document_status as enum ('draft', 'issued', 'signed', 'canceled');

-- ---------------------------------------------------------------------------
-- document_templates
-- ---------------------------------------------------------------------------

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  document_kind public.document_kind not null,
  default_sensitivity public.document_sensitivity not null,
  body_template text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger document_templates_set_updated_at
  before update on public.document_templates
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.document_templates to authenticated;
alter table public.document_templates enable row level security;

-- Secretary can read administrative-only templates (needed to pick one when
-- creating a receipt, for example) but never manages templates themselves —
-- template authoring is a configuration task, not routine administrative work.
create policy document_templates_select
  on public.document_templates for select to authenticated
  using (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and default_sensitivity = 'administrative')
  );
create policy document_templates_admin_insert
  on public.document_templates for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy document_templates_admin_update
  on public.document_templates for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy document_templates_admin_delete
  on public.document_templates for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete cascade,
  template_id uuid references public.document_templates (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  document_kind public.document_kind not null,
  -- No default on purpose: "não existe documento sem classificação; a
  -- ausência de valor é erro, não default permissivo" (docs/04).
  sensitivity public.document_sensitivity not null,
  status public.document_status not null default 'draft',
  current_version integer not null default 1 check (current_version >= 1),
  created_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_issued_has_timestamp check (
    status not in ('issued', 'signed') or issued_at is not null
  ),
  constraint documents_canceled_has_timestamp check (
    status <> 'canceled' or canceled_at is not null
  )
);

create index documents_org_idx on public.documents (organization_id, created_at desc);
create index documents_patient_idx on public.documents (patient_id) where patient_id is not null;

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- Enforces docs/04's derivation rule and immutability:
--   laudo|relatorio|atestado|encaminhamento -> always 'clinical'
--   recibo -> always 'administrative'
--   tcle|contrato|declaracao|branco|outro -> caller must choose explicitly
-- and "reclassificar exige cancelar e emitir novo documento" — sensitivity
-- never changes after the row exists, by trigger, not just by convention.
create or replace function public.assert_document_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
  template_org uuid;
begin
  if new.patient_id is not null then
    select organization_id into patient_org from public.patients where id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then
      raise exception 'document patient must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if new.template_id is not null then
    select organization_id into template_org
    from public.document_templates where id = new.template_id;
    if template_org is null or template_org <> new.organization_id then
      raise exception 'document template must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.document_kind in ('laudo', 'relatorio', 'atestado', 'encaminhamento') then
      new.sensitivity := 'clinical';
    elsif new.document_kind = 'recibo' then
      new.sensitivity := 'administrative';
    elsif new.sensitivity is null then
      raise exception 'sensitivity must be chosen explicitly for this document_kind'
        using errcode = '23514';
    end if;
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.patient_id := old.patient_id;
    new.document_kind := old.document_kind;
    new.sensitivity := old.sensitivity;
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

create trigger documents_assert_consistency
  before insert or update on public.documents
  for each row execute function public.assert_document_consistency();

grant select, insert, update on public.documents to authenticated;
alter table public.documents enable row level security;

create policy documents_select
  on public.documents for select to authenticated
  using (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and sensitivity = 'administrative')
  );
create policy documents_insert
  on public.documents for insert to authenticated
  with check (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and sensitivity = 'administrative')
  );
create policy documents_update
  on public.documents for update to authenticated
  using (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and sensitivity = 'administrative')
  )
  with check (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and sensitivity = 'administrative')
  );
-- No DELETE policy: a document is canceled, never removed.

-- ---------------------------------------------------------------------------
-- document_versions
-- ---------------------------------------------------------------------------

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version integer not null check (version >= 1),
  body_snapshot text not null,
  variables_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint document_versions_unique unique (document_id, version)
);

comment on table public.document_versions is
  'A version once created is never edited or removed — "correção gera nova versão; nunca UPDATE do corpo já emitido" (docs/04).';

create or replace function public.assert_document_version_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_org public.documents.organization_id%type;
  doc_sensitivity public.document_sensitivity;
begin
  select organization_id, sensitivity into doc_org, doc_sensitivity
  from public.documents where id = new.document_id;

  if doc_org is null or doc_org <> new.organization_id then
    raise exception 'document version organization must match its document'
      using errcode = '23514';
  end if;

  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger document_versions_assert_consistency
  before insert on public.document_versions
  for each row execute function public.assert_document_version_consistency();

-- Append-only: no UPDATE grant.
grant select, insert on public.document_versions to authenticated;
alter table public.document_versions enable row level security;

create policy document_versions_select
  on public.document_versions for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and (
          public.is_psychologist_admin(d.organization_id)
          or (public.is_org_member(d.organization_id) and d.sensitivity = 'administrative')
        )
    )
  );
create policy document_versions_insert
  on public.document_versions for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and (
          public.is_psychologist_admin(d.organization_id)
          or (public.is_org_member(d.organization_id) and d.sensitivity = 'administrative')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- document_files
-- ---------------------------------------------------------------------------

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  document_version_id uuid not null references public.document_versions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  generated_at timestamptz not null default now(),
  constraint document_files_unique_version unique (document_version_id)
);

create or replace function public.assert_document_file_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_org uuid;
  version_document uuid;
begin
  select organization_id into doc_org from public.documents where id = new.document_id;
  if doc_org is null or doc_org <> new.organization_id then
    raise exception 'document file organization must match its document'
      using errcode = '23514';
  end if;

  select document_id into version_document
  from public.document_versions where id = new.document_version_id;
  if version_document is distinct from new.document_id then
    raise exception 'document file version must belong to the same document'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger document_files_assert_consistency
  before insert on public.document_files
  for each row execute function public.assert_document_file_consistency();

grant select, insert on public.document_files to authenticated;
alter table public.document_files enable row level security;

create policy document_files_select
  on public.document_files for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_files.document_id
        and (
          public.is_psychologist_admin(d.organization_id)
          or (public.is_org_member(d.organization_id) and d.sensitivity = 'administrative')
        )
    )
  );
create policy document_files_insert
  on public.document_files for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_files.document_id
        and (
          public.is_psychologist_admin(d.organization_id)
          or (public.is_org_member(d.organization_id) and d.sensitivity = 'administrative')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- patient_attachments
-- ---------------------------------------------------------------------------

create table public.patient_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  sensitivity public.document_sensitivity not null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index patient_attachments_patient_idx on public.patient_attachments (patient_id);

create or replace function public.assert_patient_attachment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  select organization_id into patient_org from public.patients where id = new.patient_id;
  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'patient attachment must belong to the same organization'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    -- Immutable file per row: only conceivable "update" is metadata, but we
    -- don't expose one — block silently reassigning the file itself.
    new.storage_path := old.storage_path;
    new.sha256 := old.sha256;
    new.sensitivity := old.sensitivity;
    new.patient_id := old.patient_id;
    new.organization_id := old.organization_id;
    new.uploaded_by := old.uploaded_by;
  end if;

  return new;
end;
$$;

create trigger patient_attachments_assert_consistency
  before insert or update on public.patient_attachments
  for each row execute function public.assert_patient_attachment_consistency();

grant select, insert, delete on public.patient_attachments to authenticated;
alter table public.patient_attachments enable row level security;

create policy patient_attachments_select
  on public.patient_attachments for select to authenticated
  using (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and sensitivity = 'administrative')
  );
create policy patient_attachments_insert
  on public.patient_attachments for insert to authenticated
  with check (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and sensitivity = 'administrative')
  );
create policy patient_attachments_delete
  on public.patient_attachments for delete to authenticated
  using (
    public.is_psychologist_admin(organization_id)
    or (public.is_org_member(organization_id) and sensitivity = 'administrative')
  );

-- ---------------------------------------------------------------------------
-- consent_files (TCLE PDF proof of a specific consents row)
-- ---------------------------------------------------------------------------

create table public.consent_files (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references public.consents (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version text not null,
  storage_path text not null,
  sha256 text not null,
  generated_at timestamptz not null default now()
);

create or replace function public.assert_consent_file_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  consent_org uuid;
begin
  select organization_id into consent_org from public.consents where id = new.consent_id;
  if consent_org is null or consent_org <> new.organization_id then
    raise exception 'consent file organization must match its consent'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger consent_files_assert_consistency
  before insert on public.consent_files
  for each row execute function public.assert_consent_file_consistency();

grant select, insert on public.consent_files to authenticated;
alter table public.consent_files enable row level security;

create policy consent_files_select
  on public.consent_files for select to authenticated
  using (
    exists (
      select 1 from public.consents c
      where c.id = consent_files.consent_id
        and (
          public.is_psychologist_admin(c.organization_id)
          or (
            public.is_org_member(c.organization_id)
            and public.consent_type_is_administrative(c.type)
          )
        )
    )
  );
create policy consent_files_insert
  on public.consent_files for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- Storage buckets: private, zero grants for anon/authenticated. Every
-- upload/download in this phase goes through a service-role-minted signed
-- URL, after TypeScript checks the caller's role against the row's
-- sensitivity (docs/05: "Links de download são signed URLs de curta
-- duração" applies to all of these, not just session-audio-fallback).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('clinical-documents', 'clinical-documents', false),
  ('patient-attachments', 'patient-attachments', false),
  ('consents', 'consents', false)
on conflict (id) do nothing;

-- ========== 20260820170000_finance.sql ==========

-- Tesseli — Phase 10: Financeiro.
-- Specs: docs/04-data-model.md §Financeiro, docs/05-security-rbac-rls.md
-- (secretary_finance_access none/view/manage), prompts/10-finance.md.
--
-- Values are numeric(12,2). No table in this migration grants DELETE to
-- authenticated — void/cancel/refund are named states. Charge status is
-- derived from non-voided payments by trigger. A closed period blocks
-- INSERT/UPDATE of facts whose competence_date falls inside it.

create type public.financial_charge_origin as enum (
  'session', 'plan', 'subscription', 'administrative'
);

create type public.financial_charge_status as enum (
  'pending', 'partially_paid', 'paid', 'overdue', 'canceled', 'refunded'
);

create type public.financial_payment_method as enum (
  'pix', 'cash', 'card', 'transfer', 'courtesy', 'other'
);

create type public.financial_expense_status as enum (
  'pending', 'paid', 'overdue', 'canceled'
);

create type public.financial_plan_type as enum (
  'prepaid_package', 'postpaid_package', 'monthly'
);

create type public.financial_plan_status as enum (
  'active', 'exhausted', 'expired', 'canceled'
);

create type public.financial_plan_movement as enum (
  'consume', 'restore', 'adjust', 'renew'
);

create type public.financial_closing_status as enum ('open', 'closed');

-- ---------------------------------------------------------------------------
-- Permission helpers (docs/05). secretary_finance_access() already returns
-- 'manage' for psychologist_admin, so these cover both roles.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_finance(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.secretary_finance_access(org_id) in (
    'view'::public.secretary_finance_access,
    'manage'::public.secretary_finance_access
  );
$$;

create or replace function public.can_write_finance(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.secretary_finance_access(org_id) = 'manage'::public.secretary_finance_access;
$$;

revoke all on function public.can_read_finance(uuid) from public;
revoke all on function public.can_write_finance(uuid) from public;
grant execute on function public.can_read_finance(uuid) to authenticated;
grant execute on function public.can_write_finance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- financial_plans (referenced by charges)
-- ---------------------------------------------------------------------------

create table public.financial_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  plan_type public.financial_plan_type not null,
  total_sessions integer check (total_sessions is null or total_sessions > 0),
  used_sessions integer not null default 0 check (used_sessions >= 0),
  price numeric(12, 2) not null check (price >= 0),
  valid_from date,
  valid_until date,
  status public.financial_plan_status not null default 'active',
  canceled_at timestamptz,
  canceled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_plans_validity check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  ),
  constraint financial_plans_used_within_total check (
    total_sessions is null or used_sessions <= total_sessions
  )
);

create index financial_plans_patient_idx on public.financial_plans (patient_id, status);

create trigger financial_plans_set_updated_at
  before update on public.financial_plans
  for each row execute function public.set_updated_at();

create or replace function public.assert_financial_plan_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  select organization_id into patient_org from public.patients where id = new.patient_id;
  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'financial plan patient must belong to the same organization'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.patient_id := old.patient_id;
  end if;
  return new;
end;
$$;

create trigger financial_plans_assert_consistency
  before insert or update on public.financial_plans
  for each row execute function public.assert_financial_plan_consistency();

-- ---------------------------------------------------------------------------
-- financial_charges
-- ---------------------------------------------------------------------------

create table public.financial_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  session_id uuid references public.clinical_sessions (id) on delete set null,
  plan_id uuid references public.financial_plans (id) on delete set null,
  origin public.financial_charge_origin not null,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  amount numeric(12, 2) not null check (amount >= 0),
  due_date date,
  competence_date date not null,
  status public.financial_charge_status not null default 'pending',
  canceled_at timestamptz,
  canceled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  nfse_requested_at timestamptz,
  idempotency_key text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_charges_session_unique unique (organization_id, session_id),
  constraint financial_charges_idempotency_unique unique (organization_id, idempotency_key),
  constraint financial_charges_canceled_has_timestamp check (
    status <> 'canceled' or canceled_at is not null
  )
);

create unique index financial_charges_session_unique_not_null
  on public.financial_charges (organization_id, session_id)
  where session_id is not null;

-- Drop the unconstrained unique that would treat multiple NULLs as conflict
-- on some Postgres versions; the partial index above is the real rule.
alter table public.financial_charges drop constraint financial_charges_session_unique;

create unique index financial_charges_idempotency_unique_not_null
  on public.financial_charges (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.financial_charges drop constraint financial_charges_idempotency_unique;

create index financial_charges_org_due_idx
  on public.financial_charges (organization_id, due_date, status);
create index financial_charges_patient_idx
  on public.financial_charges (patient_id)
  where patient_id is not null;

create trigger financial_charges_set_updated_at
  before update on public.financial_charges
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_payments
-- ---------------------------------------------------------------------------

create table public.financial_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  charge_id uuid not null references public.financial_charges (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method public.financial_payment_method not null,
  notes text,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  registered_by uuid references auth.users (id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index financial_payments_idempotency_unique_not_null
  on public.financial_payments (organization_id, idempotency_key)
  where idempotency_key is not null;

create index financial_payments_charge_idx on public.financial_payments (charge_id);

create trigger financial_payments_set_updated_at
  before update on public.financial_payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_expenses
-- ---------------------------------------------------------------------------

create table public.financial_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category text not null check (char_length(btrim(category)) between 1 and 80),
  supplier text,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  amount numeric(12, 2) not null check (amount >= 0),
  due_date date,
  paid_at timestamptz,
  recurrence jsonb,
  attachment_document_id uuid references public.documents (id) on delete set null,
  status public.financial_expense_status not null default 'pending',
  canceled_at timestamptz,
  canceled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_expenses_org_idx
  on public.financial_expenses (organization_id, due_date, status);

create trigger financial_expenses_set_updated_at
  before update on public.financial_expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_plan_movements
-- ---------------------------------------------------------------------------

create table public.financial_plan_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.financial_plans (id) on delete cascade,
  session_id uuid references public.clinical_sessions (id) on delete set null,
  movement public.financial_plan_movement not null,
  delta integer not null,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_plan_movements_adjust_reason check (
    movement <> 'adjust' or char_length(btrim(coalesce(reason, ''))) > 0
  )
);

create unique index financial_plan_movements_consume_session_unique
  on public.financial_plan_movements (plan_id, session_id)
  where session_id is not null and movement = 'consume';

-- ---------------------------------------------------------------------------
-- financial_closings
-- ---------------------------------------------------------------------------

create table public.financial_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.financial_closing_status not null default 'closed',
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users (id) on delete set null,
  totals_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_closings_period check (period_end >= period_start),
  constraint financial_closings_period_unique unique (organization_id, period_start, period_end)
);

create trigger financial_closings_set_updated_at
  before update on public.financial_closings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Closed-period lock + charge consistency
-- ---------------------------------------------------------------------------

create or replace function public.finance_period_is_closed(org_id uuid, competence date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.financial_closings c
    where c.organization_id = org_id
      and c.status = 'closed'
      and competence between c.period_start and c.period_end
  );
$$;

revoke all on function public.finance_period_is_closed(uuid, date) from public;
grant execute on function public.finance_period_is_closed(uuid, date) to authenticated;

create or replace function public.assert_finance_period_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  competence date;
  org uuid;
begin
  org := coalesce(new.organization_id, old.organization_id);
  if tg_table_name = 'financial_charges' then
    competence := coalesce(new.competence_date, old.competence_date);
  elsif tg_table_name = 'financial_payments' then
    select competence_date into competence
    from public.financial_charges
    where id = coalesce(new.charge_id, old.charge_id);
  elsif tg_table_name = 'financial_expenses' then
    competence := coalesce(new.due_date, old.due_date, current_date);
  else
    competence := current_date;
  end if;

  if competence is not null and public.finance_period_is_closed(org, competence) then
    raise exception 'financial period is closed for this competence date'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger financial_charges_period_lock
  before insert or update on public.financial_charges
  for each row execute function public.assert_finance_period_open();

create trigger financial_payments_period_lock
  before insert or update on public.financial_payments
  for each row execute function public.assert_finance_period_open();

create trigger financial_expenses_period_lock
  before insert or update on public.financial_expenses
  for each row execute function public.assert_finance_period_open();

create or replace function public.assert_financial_charge_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
  session_org uuid;
begin
  if new.patient_id is not null then
    select organization_id into patient_org from public.patients where id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then
      raise exception 'financial charge patient must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;
  if new.session_id is not null then
    select organization_id into session_org from public.clinical_sessions where id = new.session_id;
    if session_org is null or session_org <> new.organization_id then
      raise exception 'financial charge session must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.due_date is not null and new.due_date < current_date and new.status = 'pending' then
      new.status := 'overdue';
    end if;
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.session_id := old.session_id;
    new.origin := old.origin;
    new.created_by := old.created_by;
    if new.status in ('canceled', 'refunded') and old.status not in ('canceled', 'refunded') then
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_charges_assert_consistency
  before insert or update on public.financial_charges
  for each row execute function public.assert_financial_charge_consistency();

create or replace function public.refresh_charge_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.financial_charges%rowtype;
  paid numeric(12, 2);
  next_status public.financial_charge_status;
begin
  select * into charge from public.financial_charges where id = new.charge_id;
  if not found then
    return new;
  end if;
  if charge.status in ('canceled', 'refunded') then
    return new;
  end if;

  select coalesce(sum(amount), 0) into paid
  from public.financial_payments
  where charge_id = charge.id and voided_at is null;

  if paid >= charge.amount and charge.amount > 0 then
    next_status := 'paid';
  elsif paid > 0 then
    next_status := 'partially_paid';
  elsif charge.due_date is not null and charge.due_date < current_date then
    next_status := 'overdue';
  else
    next_status := 'pending';
  end if;

  if charge.status is distinct from next_status then
    update public.financial_charges
    set status = next_status
    where id = charge.id;
  end if;
  return new;
end;
$$;

create trigger financial_payments_refresh_charge
  after insert or update on public.financial_payments
  for each row execute function public.refresh_charge_status();

create or replace function public.assert_financial_payment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge_org uuid;
  charge_status public.financial_charge_status;
  charge_amount numeric(12, 2);
  already_paid numeric(12, 2);
begin
  select organization_id, status, amount
    into charge_org, charge_status, charge_amount
  from public.financial_charges
  where id = new.charge_id;

  if charge_org is null or charge_org <> new.organization_id then
    raise exception 'financial payment charge must belong to the same organization'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.registered_by := auth.uid();
    if charge_status in ('canceled', 'refunded') then
      raise exception 'cannot pay a canceled or refunded charge'
        using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0) into already_paid
    from public.financial_payments
    where charge_id = new.charge_id and voided_at is null;
    if already_paid + new.amount > charge_amount then
      raise exception 'payment exceeds remaining charge amount'
        using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.charge_id := old.charge_id;
    new.amount := old.amount;
    new.registered_by := old.registered_by;
    if new.voided_at is not null and old.voided_at is null then
      new.voided_by := coalesce(new.voided_by, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_payments_assert_consistency
  before insert or update on public.financial_payments
  for each row execute function public.assert_financial_payment_consistency();

create or replace function public.assert_financial_expense_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.due_date is not null and new.due_date < current_date and new.status = 'pending' then
      new.status := 'overdue';
    end if;
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.created_by := old.created_by;
    if new.status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    end if;
    if new.status = 'canceled' and old.status <> 'canceled' then
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_expenses_assert_consistency
  before insert or update on public.financial_expenses
  for each row execute function public.assert_financial_expense_consistency();

create or replace function public.refresh_plan_used_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  used integer;
  total integer;
  until_date date;
  next_status public.financial_plan_status;
  current_status public.financial_plan_status;
begin
  target := coalesce(new.plan_id, old.plan_id);
  select coalesce(sum(delta), 0) into used
  from public.financial_plan_movements
  where plan_id = target;

  select total_sessions, valid_until, status
    into total, until_date, current_status
  from public.financial_plans
  where id = target;

  if current_status = 'canceled' then
    next_status := 'canceled';
  elsif until_date is not null and until_date < current_date then
    next_status := 'expired';
  elsif total is not null and used >= total then
    next_status := 'exhausted';
  else
    next_status := 'active';
  end if;

  update public.financial_plans
  set used_sessions = used, status = next_status
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger financial_plan_movements_refresh_plan
  after insert on public.financial_plan_movements
  for each row execute function public.refresh_plan_used_sessions();

create or replace function public.assert_financial_plan_movement_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_org uuid;
  plan_status public.financial_plan_status;
  used integer;
  total integer;
begin
  select organization_id, status, used_sessions, total_sessions
    into plan_org, plan_status, used, total
  from public.financial_plans
  where id = new.plan_id;
  if plan_org is null or plan_org <> new.organization_id then
    raise exception 'financial plan movement must belong to the same organization'
      using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  if new.movement = 'consume' then
    if plan_status <> 'active' then
      raise exception 'cannot consume a plan that is not active'
        using errcode = 'P0001';
    end if;
    if new.delta <= 0 then
      raise exception 'consume delta must be positive' using errcode = '23514';
    end if;
    if total is not null and used + new.delta > total then
      raise exception 'plan has no remaining sessions' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_plan_movements_assert_consistency
  before insert on public.financial_plan_movements
  for each row execute function public.assert_financial_plan_movement_consistency();

-- ---------------------------------------------------------------------------
-- Session finalization → charge (idempotent via unique session_id)
-- ---------------------------------------------------------------------------

create or replace function public.create_session_charge(
  p_session_id uuid,
  org_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  sess record;
  fee numeric(12, 2);
  existing uuid;
  existing_consume uuid;
  active_plan public.financial_plans%rowtype;
  new_id uuid;
  competence date;
begin
  if not public.can_write_finance(org_id) then
    raise exception 'not authorized to write finance' using errcode = '42501';
  end if;

  select cs.id, cs.organization_id, cs.patient_id, cs.started_at
    into sess
  from public.clinical_sessions cs
  where cs.id = p_session_id and cs.organization_id = org_id;
  if sess.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  competence := (sess.started_at at time zone 'UTC')::date;

  select id into existing
  from public.financial_charges
  where organization_id = org_id and session_id = p_session_id;
  if existing is not null then
    return existing;
  end if;

  select id into existing_consume
  from public.financial_plan_movements
  where organization_id = org_id
    and session_id = p_session_id
    and movement = 'consume';
  if existing_consume is not null then
    return null;
  end if;

  select * into active_plan
  from public.financial_plans
  where organization_id = org_id
    and patient_id = sess.patient_id
    and status = 'active'
    and (valid_from is null or valid_from <= competence)
    and (valid_until is null or valid_until >= competence)
  order by created_at
  limit 1;

  if found then
    if active_plan.plan_type = 'monthly' then
      return null;
    end if;
    if active_plan.plan_type in ('prepaid_package', 'postpaid_package')
       and (active_plan.total_sessions is null
            or active_plan.used_sessions < active_plan.total_sessions) then
      insert into public.financial_plan_movements (
        organization_id, plan_id, session_id, movement, delta, reason
      ) values (
        org_id, active_plan.id, p_session_id, 'consume', 1, 'Consumo na finalização da sessão'
      );
      return null;
    end if;
  end if;

  select default_session_value into fee
  from public.patients
  where id = sess.patient_id;
  if fee is null or fee <= 0 then
    return null;
  end if;

  insert into public.financial_charges (
    organization_id, patient_id, session_id, origin, description,
    amount, due_date, competence_date, status
  ) values (
    org_id,
    sess.patient_id,
    p_session_id,
    'session',
    'Sessão clínica',
    fee,
    competence,
    competence,
    'pending'
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_session_charge(uuid, uuid) from public;
grant execute on function public.create_session_charge(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants + RLS. No DELETE on any financial fact table.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.financial_charges to authenticated;
grant select, insert, update on public.financial_payments to authenticated;
grant select, insert, update on public.financial_expenses to authenticated;
grant select, insert, update on public.financial_plans to authenticated;
grant select, insert on public.financial_plan_movements to authenticated;
grant select, insert, update on public.financial_closings to authenticated;

alter table public.financial_charges enable row level security;
alter table public.financial_payments enable row level security;
alter table public.financial_expenses enable row level security;
alter table public.financial_plans enable row level security;
alter table public.financial_plan_movements enable row level security;
alter table public.financial_closings enable row level security;

create policy financial_charges_select on public.financial_charges
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_charges_insert on public.financial_charges
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_charges_update on public.financial_charges
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_payments_select on public.financial_payments
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_payments_insert on public.financial_payments
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_payments_update on public.financial_payments
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_expenses_select on public.financial_expenses
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_expenses_insert on public.financial_expenses
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_expenses_update on public.financial_expenses
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_plans_select on public.financial_plans
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_plans_insert on public.financial_plans
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_plans_update on public.financial_plans
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_plan_movements_select on public.financial_plan_movements
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_plan_movements_insert on public.financial_plan_movements
  for insert to authenticated with check (public.can_write_finance(organization_id));

create policy financial_closings_select on public.financial_closings
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_closings_insert on public.financial_closings
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_closings_update on public.financial_closings
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

-- ========== 20260820220000_whatsapp.sql ==========

-- Tesseli — Phase 11: Twilio WhatsApp (preferences, outbox, messages, inbound).
-- Specs: prompts/11-twilio.md, docs/04-data-model.md §Comunicação,
-- docs/06-integrations.md §2, docs/03-architecture.md (pg_cron + pg_net).
--
-- Vault secret *values* are never written here. Operators provision
-- `tesseli_app_url` and `tesseli_cron_secret` in Supabase Vault; the cron
-- function reads them at runtime.

-- Hosted Supabase grants this by default; the local RLS harness only granted
-- `anon`/`authenticated`. Jobs and webhooks run as service_role.
grant usage on schema public to service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.whatsapp_reminder_type as enum (
  'reminder_24h',
  'reminder_2h'
);

create type public.whatsapp_outbox_state as enum (
  'scheduled',
  'claimed',
  'sending',
  'sent',
  'retryable_failed',
  'permanent_failed',
  'canceled'
);

create type public.whatsapp_direction as enum (
  'outbound',
  'inbound'
);

create type public.whatsapp_template_key as enum (
  'confirmation',
  'reminder_24h',
  'reminder_2h',
  'welcome',
  'billing'
);

create type public.whatsapp_inbound_intent as enum (
  'confirm',
  'decline_pending',
  'reschedule_pending',
  'unknown'
);

-- Configurable lead times for the 24h/2h reminders (hours before start).
alter table public.practice_settings
  add column if not exists reminder_lead_hours_24 numeric not null default 24
    check (reminder_lead_hours_24 > 0 and reminder_lead_hours_24 <= 168),
  add column if not exists reminder_lead_hours_2 numeric not null default 2
    check (reminder_lead_hours_2 > 0 and reminder_lead_hours_2 < 24);

-- ---------------------------------------------------------------------------
-- communication_preferences
-- ---------------------------------------------------------------------------

create table public.communication_preferences (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  whatsapp_enabled boolean not null default false,
  consent_id uuid references public.consents (id) on delete set null,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index communication_preferences_org_idx
  on public.communication_preferences (organization_id);

create trigger communication_preferences_set_updated_at
  before update on public.communication_preferences
  for each row execute function public.set_updated_at();

create or replace function public.assert_communication_preference_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
  consent_ok boolean := false;
begin
  select organization_id into patient_org from public.patients where id = new.patient_id;
  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'communication preference patient must belong to the same organization'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.patient_id := old.patient_id;
  end if;
  if new.whatsapp_enabled then
    select exists (
      select 1
      from public.consents c
      where c.patient_id = new.patient_id
        and c.organization_id = new.organization_id
        and c.type = 'whatsapp'
        and c.status = 'accepted'
        and (new.consent_id is null or c.id = new.consent_id)
    ) into consent_ok;
    if not consent_ok then
      raise exception 'whatsapp preference requires an accepted whatsapp consent'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger communication_preferences_assert_consistency
  before insert or update on public.communication_preferences
  for each row execute function public.assert_communication_preference_consistency();

alter table public.communication_preferences enable row level security;

create policy communication_preferences_select on public.communication_preferences
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy communication_preferences_insert on public.communication_preferences
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy communication_preferences_update on public.communication_preferences
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.communication_preferences from public, anon;
grant select, insert, update on public.communication_preferences to authenticated;
grant select, insert, update on public.communication_preferences to service_role;

-- Secretaria opera o canal administrativo (WhatsApp / termos). Insert/update
-- of clinical consents remains psychologist_admin-only (Fase 5.5).
create policy consents_insert_administrative
  on public.consents
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.consent_type_is_administrative(type)
  );

create policy consents_update_administrative
  on public.consents
  for update
  to authenticated
  using (
    public.is_org_member(organization_id)
    and public.consent_type_is_administrative(type)
  )
  with check (
    public.is_org_member(organization_id)
    and public.consent_type_is_administrative(type)
  );

-- ---------------------------------------------------------------------------
-- whatsapp_templates
-- ---------------------------------------------------------------------------

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_key public.whatsapp_template_key not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  twilio_content_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key)
);

create trigger whatsapp_templates_set_updated_at
  before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;

create policy whatsapp_templates_select on public.whatsapp_templates
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy whatsapp_templates_write on public.whatsapp_templates
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy whatsapp_templates_update on public.whatsapp_templates
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.whatsapp_templates from public, anon;
grant select, insert, update on public.whatsapp_templates to authenticated;
grant select, insert, update on public.whatsapp_templates to service_role;

create or replace function public.ensure_whatsapp_templates(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.whatsapp_templates (organization_id, template_key, body)
  values
    (p_org_id, 'confirmation', 'Olá, {{patient_name}}! Confirmamos sua sessão em {{starts_at}}. Qualquer imprevisto, responda esta mensagem.'),
    (p_org_id, 'reminder_24h', 'Olá, {{patient_name}}! Lembrete: sua sessão é amanhã, {{starts_at}}. Responda SIM para confirmar.'),
    (p_org_id, 'reminder_2h', 'Olá, {{patient_name}}! Sua sessão começa em cerca de 2 horas ({{starts_at}}). Até breve.'),
    (p_org_id, 'welcome', 'Olá, {{patient_name}}! Este é o canal administrativo do consultório. Avisos de sessão e confirmações chegam por aqui.'),
    (p_org_id, 'billing', 'Olá, {{patient_name}}! Segue o lembrete administrativo referente ao valor combinado da sessão. Qualquer dúvida, fale conosco.')
  on conflict (organization_id, template_key) do nothing;
end;
$$;

revoke all on function public.ensure_whatsapp_templates(uuid) from public;
grant execute on function public.ensure_whatsapp_templates(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- whatsapp_reminder_outbox
-- ---------------------------------------------------------------------------

create table public.whatsapp_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  reminder_type public.whatsapp_reminder_type not null,
  scheduled_for timestamptz not null,
  state public.whatsapp_outbox_state not null default 'scheduled',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  twilio_message_sid text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, reminder_type)
);

create index whatsapp_reminder_outbox_due_idx
  on public.whatsapp_reminder_outbox (
    coalesce(next_attempt_at, scheduled_for)
  )
  where state in ('scheduled', 'retryable_failed');

create trigger whatsapp_reminder_outbox_set_updated_at
  before update on public.whatsapp_reminder_outbox
  for each row execute function public.set_updated_at();

alter table public.whatsapp_reminder_outbox enable row level security;

create policy whatsapp_outbox_select on public.whatsapp_reminder_outbox
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy whatsapp_outbox_insert on public.whatsapp_reminder_outbox
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy whatsapp_outbox_update on public.whatsapp_reminder_outbox
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.whatsapp_reminder_outbox from public, anon;
grant select, insert, update on public.whatsapp_reminder_outbox to authenticated;
grant select, insert, update on public.whatsapp_reminder_outbox to service_role;

-- ---------------------------------------------------------------------------
-- whatsapp_messages (outbound log)
-- ---------------------------------------------------------------------------

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  outbox_id uuid references public.whatsapp_reminder_outbox (id) on delete set null,
  direction public.whatsapp_direction not null default 'outbound',
  message_sid text,
  template_key public.whatsapp_template_key,
  status text not null default 'queued',
  to_number text not null,
  scheduled_for timestamptz,
  sent_at timestamptz,
  -- Minimized: never store clinical content. Templates are administrative.
  body_redacted text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create unique index whatsapp_messages_sid_unique
  on public.whatsapp_messages (message_sid)
  where message_sid is not null;

create trigger whatsapp_messages_set_updated_at
  before update on public.whatsapp_messages
  for each row execute function public.set_updated_at();

alter table public.whatsapp_messages enable row level security;

create policy whatsapp_messages_select on public.whatsapp_messages
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy whatsapp_messages_insert on public.whatsapp_messages
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy whatsapp_messages_update on public.whatsapp_messages
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.whatsapp_messages from public, anon;
grant select, insert, update on public.whatsapp_messages to authenticated;
grant select, insert, update on public.whatsapp_messages to service_role;

-- ---------------------------------------------------------------------------
-- whatsapp_inbound_messages
-- ---------------------------------------------------------------------------

create table public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  message_sid text not null unique,
  from_number text not null,
  -- Stored only after minimization; inbound parser keeps a short intent token.
  body_redacted text,
  processed boolean not null default false,
  intent public.whatsapp_inbound_intent not null default 'unknown',
  created_at timestamptz not null default now()
);

alter table public.whatsapp_inbound_messages enable row level security;

create policy whatsapp_inbound_select on public.whatsapp_inbound_messages
  for select to authenticated
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

create policy whatsapp_inbound_insert on public.whatsapp_inbound_messages
  for insert to authenticated
  with check (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

create policy whatsapp_inbound_update on public.whatsapp_inbound_messages
  for update to authenticated
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  )
  with check (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

revoke all on public.whatsapp_inbound_messages from public, anon;
grant select, insert, update on public.whatsapp_inbound_messages to authenticated;
grant select, insert, update on public.whatsapp_inbound_messages to service_role;

-- ---------------------------------------------------------------------------
-- Enqueue / cancel (SECURITY DEFINER, membership-checked except service_role)
-- ---------------------------------------------------------------------------

create or replace function public.patient_whatsapp_allowed(p_org_id uuid, p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.communication_preferences p
    join public.consents c
      on c.patient_id = p.patient_id
     and c.organization_id = p.organization_id
     and c.type = 'whatsapp'
     and c.status = 'accepted'
    where p.organization_id = p_org_id
      and p.patient_id = p_patient_id
      and p.whatsapp_enabled
  );
$$;

revoke all on function public.patient_whatsapp_allowed(uuid, uuid) from public;
grant execute on function public.patient_whatsapp_allowed(uuid, uuid) to authenticated, service_role;

create or replace function public.enqueue_appointment_whatsapp_reminders(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appt record;
  lead_24 numeric;
  lead_2 numeric;
  when_24 timestamptz;
  when_2 timestamptz;
begin
  select a.id, a.organization_id, a.patient_id, a.starts_at, a.origin, a.status
    into appt
  from public.appointments a
  where a.id = p_appointment_id;

  if appt.id is null then
    return;
  end if;
  if (select auth.role()) <> 'service_role'
     and auth.uid() is not null
     and not public.is_org_member(appt.organization_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if appt.origin <> 'TESSELI' or appt.patient_id is null then
    return;
  end if;
  if appt.status in ('cancelled', 'completed') then
    update public.whatsapp_reminder_outbox
       set state = 'canceled'
     where appointment_id = appt.id
       and state in ('scheduled', 'retryable_failed', 'claimed');
    return;
  end if;
  if not public.patient_whatsapp_allowed(appt.organization_id, appt.patient_id) then
    update public.whatsapp_reminder_outbox
       set state = 'canceled'
     where appointment_id = appt.id
       and state in ('scheduled', 'retryable_failed', 'claimed');
    return;
  end if;

  perform public.ensure_whatsapp_templates(appt.organization_id);

  select reminder_lead_hours_24, reminder_lead_hours_2
    into lead_24, lead_2
  from public.practice_settings
  where organization_id = appt.organization_id;

  lead_24 := coalesce(lead_24, 24);
  lead_2 := coalesce(lead_2, 2);
  when_24 := appt.starts_at - (lead_24 * interval '1 hour');
  when_2 := appt.starts_at - (lead_2 * interval '1 hour');

  if when_24 > now() then
    insert into public.whatsapp_reminder_outbox (
      organization_id, appointment_id, patient_id, reminder_type, scheduled_for, state
    ) values (
      appt.organization_id, appt.id, appt.patient_id, 'reminder_24h', when_24, 'scheduled'
    )
    on conflict (appointment_id, reminder_type) do update
      set scheduled_for = excluded.scheduled_for,
          state = case
            when public.whatsapp_reminder_outbox.state in ('sent', 'sending') then public.whatsapp_reminder_outbox.state
            else 'scheduled'
          end,
          next_attempt_at = null,
          last_error_code = null
      where public.whatsapp_reminder_outbox.state not in ('sent', 'sending');
  end if;

  if when_2 > now() then
    insert into public.whatsapp_reminder_outbox (
      organization_id, appointment_id, patient_id, reminder_type, scheduled_for, state
    ) values (
      appt.organization_id, appt.id, appt.patient_id, 'reminder_2h', when_2, 'scheduled'
    )
    on conflict (appointment_id, reminder_type) do update
      set scheduled_for = excluded.scheduled_for,
          state = case
            when public.whatsapp_reminder_outbox.state in ('sent', 'sending') then public.whatsapp_reminder_outbox.state
            else 'scheduled'
          end,
          next_attempt_at = null,
          last_error_code = null
      where public.whatsapp_reminder_outbox.state not in ('sent', 'sending');
  end if;
end;
$$;

revoke all on function public.enqueue_appointment_whatsapp_reminders(uuid) from public;
grant execute on function public.enqueue_appointment_whatsapp_reminders(uuid) to authenticated, service_role;

create or replace function public.sync_patient_whatsapp_outbox(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appt record;
  pref_org uuid;
begin
  select organization_id into pref_org
  from public.communication_preferences
  where patient_id = p_patient_id;

  if pref_org is null then
    return;
  end if;
  if (select auth.role()) <> 'service_role'
     and auth.uid() is not null
     and not public.is_org_member(pref_org) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.patient_whatsapp_allowed(pref_org, p_patient_id) then
    update public.whatsapp_reminder_outbox
       set state = 'canceled'
     where patient_id = p_patient_id
       and state in ('scheduled', 'retryable_failed', 'claimed');
    return;
  end if;

  for appt in
    select id
    from public.appointments
    where patient_id = p_patient_id
      and organization_id = pref_org
      and origin = 'TESSELI'
      and status in ('scheduled', 'confirmed')
  loop
    perform public.enqueue_appointment_whatsapp_reminders(appt.id);
  end loop;
end;
$$;

revoke all on function public.sync_patient_whatsapp_outbox(uuid) from public;
grant execute on function public.sync_patient_whatsapp_outbox(uuid) to authenticated, service_role;

create or replace function public.communication_preferences_sync_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_patient_whatsapp_outbox(new.patient_id);
  return new;
end;
$$;

create trigger communication_preferences_sync_whatsapp
  after insert or update of whatsapp_enabled, consent_id on public.communication_preferences
  for each row execute function public.communication_preferences_sync_whatsapp();

create or replace function public.appointments_sync_whatsapp_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_appointment_whatsapp_reminders(new.id);
  return new;
end;
$$;

create trigger appointments_sync_whatsapp_outbox
  after insert or update of starts_at, status, patient_id on public.appointments
  for each row execute function public.appointments_sync_whatsapp_outbox();

-- ---------------------------------------------------------------------------
-- Atomic claim (service_role only — called by the Next.js cron job)
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_whatsapp_reminders(p_limit integer default 20)
returns setof public.whatsapp_reminder_outbox
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  with due as (
    select o.id
    from public.whatsapp_reminder_outbox o
    join public.organizations org on org.id = o.organization_id
    left join public.communication_preferences pref
      on pref.patient_id = o.patient_id
     and pref.organization_id = o.organization_id
    where o.state in ('scheduled', 'retryable_failed')
      and coalesce(o.next_attempt_at, o.scheduled_for) <= now()
      and (
        pref.quiet_hours_start is null
        or pref.quiet_hours_end is null
        or not (
          case
            when pref.quiet_hours_start < pref.quiet_hours_end then
              (timezone(org.timezone, now()))::time >= pref.quiet_hours_start
              and (timezone(org.timezone, now()))::time < pref.quiet_hours_end
            else
              (timezone(org.timezone, now()))::time >= pref.quiet_hours_start
              or (timezone(org.timezone, now()))::time < pref.quiet_hours_end
          end
        )
      )
    order by coalesce(o.next_attempt_at, o.scheduled_for)
    limit greatest(coalesce(p_limit, 20), 1)
    for update of o skip locked
  )
  update public.whatsapp_reminder_outbox o
     set state = 'claimed',
         claimed_at = now(),
         attempt_count = o.attempt_count + 1
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

revoke all on function public.claim_due_whatsapp_reminders(integer) from public;
grant execute on function public.claim_due_whatsapp_reminders(integer) to service_role;

-- Locate a patient by inbound WhatsApp E.164 without leaking across tenants
-- in the application layer: the webhook only uses a row when the match is unique.
create or replace function public.match_patients_by_whatsapp_e164(p_e164 text)
returns table (organization_id uuid, patient_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.match_patients_by_whatsapp_e164(text) from public;
grant execute on function public.match_patients_by_whatsapp_e164(text) to service_role;

create or replace function public.mark_whatsapp_outbox_sending(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.whatsapp_reminder_outbox
     set state = 'sending'
   where id = p_id
     and state = 'claimed';
end;
$$;

create or replace function public.mark_whatsapp_outbox_sent(p_id uuid, p_sid text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.whatsapp_reminder_outbox
     set state = 'sent',
         twilio_message_sid = p_sid,
         sent_at = now(),
         last_error_code = null
   where id = p_id;
end;
$$;

create or replace function public.mark_whatsapp_outbox_failed(
  p_id uuid,
  p_retryable boolean,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempts integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select attempt_count into attempts
  from public.whatsapp_reminder_outbox
  where id = p_id;
  if p_retryable and coalesce(attempts, 0) < 5 then
    update public.whatsapp_reminder_outbox
       set state = 'retryable_failed',
           last_error_code = left(p_error_code, 80),
           next_attempt_at = now() + (interval '2 minutes' * attempts)
     where id = p_id;
  else
    update public.whatsapp_reminder_outbox
       set state = 'permanent_failed',
           last_error_code = left(p_error_code, 80)
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.mark_whatsapp_outbox_sending(uuid) from public;
revoke all on function public.mark_whatsapp_outbox_sent(uuid, text) from public;
revoke all on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) from public;
grant execute on function public.mark_whatsapp_outbox_sending(uuid) to service_role;
grant execute on function public.mark_whatsapp_outbox_sent(uuid, text) to service_role;
grant execute on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler: read Vault (no secret values here) + pg_net POST
-- ---------------------------------------------------------------------------

create or replace function public.invoke_whatsapp_reminder_job()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
begin
  begin
    select s.secret into app_url
    from vault.decrypted_secrets s
    where s.name = 'tesseli_app_url';
    select s.secret into cron_secret
    from vault.decrypted_secrets s
    where s.name = 'tesseli_cron_secret';
  exception
    when undefined_table then
      return;
    when invalid_schema_name then
      return;
  end;

  if app_url is null or btrim(app_url) = '' or cron_secret is null or btrim(cron_secret) = '' then
    return;
  end if;

  begin
    perform net.http_post(
      url := rtrim(app_url, '/') || '/api/jobs/whatsapp-reminders',
      body := jsonb_build_object('source', 'pg_cron'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', cron_secret
      )
    );
  exception
    when undefined_function then
      return;
    when invalid_schema_name then
      return;
  end;
end;
$$;

revoke all on function public.invoke_whatsapp_reminder_job() from public;
grant execute on function public.invoke_whatsapp_reminder_job() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      perform cron.schedule(
        'tesseli-whatsapp-reminders',
        '*/5 * * * *',
        'select public.invoke_whatsapp_reminder_job()'
      );
    end if;
  end if;
exception
  when others then
    -- Local test Postgres may lack pg_cron privileges; the Next.js job
    -- remains the processor and can be invoked directly in tests.
    null;
end;
$$;

-- ========== 20260820230000_settings_backup.sql ==========

-- Tesseli — Phase 12: settings, logical export, LGPD elimination job hooks.
-- Specs: prompts/12-settings-backup.md, docs/08-implementation-phases.md,
-- docs/06-integrations.md §5, docs/19-lgpd-privacy.md §5,
-- docs/05-security-rbac-rls.md (settings/security/team = admin only).
--
-- Vault secret *values* are never written here. Operators already provision
-- `tesseli_app_url` and `tesseli_cron_secret` for the Fase 11 scheduler; the
-- audio-retention cron reuses the same names.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.logical_export_scope as enum (
  'organization',
  'patient'
);

create type public.logical_export_status as enum (
  'queued',
  'packing',
  'ready',
  'failed',
  'expired'
);

-- ---------------------------------------------------------------------------
-- logical_exports
-- ---------------------------------------------------------------------------

create table public.logical_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  scope public.logical_export_scope not null,
  patient_id uuid references public.patients (id) on delete set null,
  schema_version text not null default 'tesseli-export-v1'
    check (char_length(btrim(schema_version)) between 1 and 40),
  status public.logical_export_status not null default 'queued',
  storage_path text,
  package_bytes integer check (package_bytes is null or package_bytes >= 0),
  file_count integer check (file_count is null or file_count >= 0),
  package_sha256 text check (package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  error_code text,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint logical_exports_patient_scope_coherent check (
    (scope = 'patient' and patient_id is not null)
    or (scope = 'organization' and patient_id is null)
  )
);

create index logical_exports_org_requested_idx
  on public.logical_exports (organization_id, requested_at desc);

create trigger logical_exports_set_updated_at
  before update on public.logical_exports
  for each row execute function public.set_updated_at();

create or replace function public.assert_logical_export_consistency()
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
    new.actor_user_id := old.actor_user_id;
    new.scope := old.scope;
    new.patient_id := old.patient_id;
  end if;

  if new.patient_id is not null then
    select organization_id into patient_org
    from public.patients
    where id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then
      raise exception 'export patient must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if not public.is_psychologist_admin(new.organization_id)
     and (select auth.role()) <> 'service_role' then
    raise exception 'only psychologist_admin may manage logical exports'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger logical_exports_assert_consistency
  before insert or update on public.logical_exports
  for each row execute function public.assert_logical_export_consistency();

alter table public.logical_exports enable row level security;

create policy logical_exports_select_admin on public.logical_exports
  for select to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy logical_exports_insert_admin on public.logical_exports
  for insert to authenticated
  with check (
    public.is_psychologist_admin(organization_id)
    and actor_user_id = auth.uid()
  );

create policy logical_exports_update_admin on public.logical_exports
  for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- No DELETE policy / GRANT: expire or mark failed; never erase the fact.

revoke all on public.logical_exports from public, anon;
grant select, insert, update on public.logical_exports to authenticated;
grant select, insert, update on public.logical_exports to service_role;

-- ---------------------------------------------------------------------------
-- Private export bucket: signed download only, after role check in app code.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('tesseli-exports', 'tesseli-exports', false)
on conflict (id) do nothing;

-- Zero storage.objects policies for anon/authenticated: the zip is clinical
-- portability data. Download URLs are minted server-side after the same
-- psychologist_admin check that authorized the export.

-- ---------------------------------------------------------------------------
-- Team: list + invite (email lives in auth.users, not in memberships)
-- ---------------------------------------------------------------------------

create or replace function public.list_organization_members(p_org_id uuid)
returns table (
  id uuid,
  user_id uuid,
  role public.organization_role,
  active boolean,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_psychologist_admin(p_org_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.user_id,
    m.role,
    m.active,
    u.email,
    m.created_at
  from public.organization_members m
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_org_id
  order by m.created_at;
end;
$$;

revoke all on function public.list_organization_members(uuid) from public;
grant execute on function public.list_organization_members(uuid) to authenticated;

create or replace function public.invite_organization_member(
  p_org_id uuid,
  p_email text,
  p_role public.organization_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  membership_id uuid;
begin
  if not public.is_psychologist_admin(p_org_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_email is null or btrim(p_email) = '' or position('@' in p_email) = 0 then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  select u.id into target_user
  from auth.users u
  where lower(u.email) = lower(btrim(p_email));

  if target_user is null then
    raise exception 'user is not registered'
      using errcode = 'P0001';
  end if;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (p_org_id, target_user, p_role, true)
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        active = true
  returning id into membership_id;

  return membership_id;
end;
$$;

revoke all on function public.invite_organization_member(uuid, text, public.organization_role) from public;
grant execute on function public.invite_organization_member(uuid, text, public.organization_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Fallback-audio retention (docs/19-lgpd-privacy.md §3)
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_fallback_audio()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with doomed as (
    select o.id
    from storage.objects o
    join public.practice_settings s
      on (storage.foldername(o.name))[1] = s.organization_id::text
    where o.bucket_id = 'session-audio-fallback'
      and o.created_at < now() - make_interval(days => s.session_audio_fallback_retention_days)
  ),
  gone as (
    delete from storage.objects o
    using doomed
    where o.id = doomed.id
    returning o.id
  )
  select count(*)::integer into deleted_count from gone;

  return coalesce(deleted_count, 0);
end;
$$;

revoke all on function public.purge_expired_fallback_audio() from public;
grant execute on function public.purge_expired_fallback_audio() to service_role;

create or replace function public.expire_stale_logical_exports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.logical_exports
     set status = 'expired'
   where status = 'ready'
     and coalesce(expires_at, ready_at + interval '24 hours') <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.expire_stale_logical_exports() from public;
grant execute on function public.expire_stale_logical_exports() to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler: same Vault names as Fase 11, daily cadence.
-- ---------------------------------------------------------------------------

create or replace function public.invoke_audio_retention_job()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
begin
  begin
    select s.secret into app_url
    from vault.decrypted_secrets s
    where s.name = 'tesseli_app_url';
    select s.secret into cron_secret
    from vault.decrypted_secrets s
    where s.name = 'tesseli_cron_secret';
  exception
    when undefined_table then
      return;
    when invalid_schema_name then
      return;
  end;

  if app_url is null or btrim(app_url) = '' or cron_secret is null or btrim(cron_secret) = '' then
    return;
  end if;

  begin
    perform net.http_post(
      url := rtrim(app_url, '/') || '/api/jobs/audio-retention',
      body := jsonb_build_object('source', 'pg_cron'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', cron_secret
      )
    );
  exception
    when undefined_function then
      return;
    when invalid_schema_name then
      return;
  end;
end;
$$;

revoke all on function public.invoke_audio_retention_job() from public;
grant execute on function public.invoke_audio_retention_job() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      perform cron.schedule(
        'tesseli-audio-retention',
        '0 3 * * *',
        'select public.invoke_audio_retention_job()'
      );
    end if;
  end if;
exception
  when others then
    null;
end;
$$;
