-- SerenaPsi — Phase 2: tenancy, RBAC, RLS and audit trail.
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
