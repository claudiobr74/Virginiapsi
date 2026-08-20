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
