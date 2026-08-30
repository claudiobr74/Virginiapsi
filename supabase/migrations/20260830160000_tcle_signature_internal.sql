-- VirgíniaPsi — TCLE legal review flag, CRP state, internal professional signature.
-- TCLE remains draft / not released for real use until legal_review_status = approved.
-- Internal signature is NOT ICP-Brasil.

create type public.legal_review_status as enum (
  'draft',
  'under_review',
  'approved',
  'retired'
);

create table public.tcle_catalog (
  version text primary key check (char_length(btrim(version)) between 1 and 40),
  body_sha256 text not null,
  legal_review_status public.legal_review_status not null default 'draft',
  published_at timestamptz not null default now()
);

insert into public.tcle_catalog (version, body_sha256, legal_review_status)
values (
  'tcle-2026-08-v1',
  'pending-compute-at-accept',
  'draft'
);

alter table public.tcle_catalog enable row level security;
create policy tcle_catalog_select
  on public.tcle_catalog for select to authenticated
  using (true);
grant select on public.tcle_catalog to authenticated;

alter table public.consents
  add column if not exists body_sha256 text,
  add column if not exists legal_review_status public.legal_review_status not null default 'draft';

comment on column public.consents.legal_review_status is
  'Snapshot of the TCLE catalog status at acceptance. draft = not released for real legal use.';

alter table public.practice_settings
  add column if not exists crp_state text;

-- ---------------------------------------------------------------------------
-- Internal professional signature (virginiapsi_internal). Not ICP-Brasil.
-- ---------------------------------------------------------------------------

create table public.document_professional_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  document_version_id uuid not null references public.document_versions (id) on delete restrict,
  document_file_id uuid not null references public.document_files (id) on delete restrict,
  professional_user_id uuid not null references auth.users (id) on delete restrict,
  professional_name text not null,
  professional_registration text,
  professional_registration_state text,
  document_sha256 text not null,
  signed_at timestamptz not null default now(),
  signature_method text not null default 'virginiapsi_internal'
    check (signature_method = 'virginiapsi_internal'),
  confirmation_acknowledged boolean not null check (confirmation_acknowledged = true),
  constraint document_professional_signatures_unique_version unique (document_version_id)
);

create index document_professional_signatures_document_idx
  on public.document_professional_signatures (document_id);

create or replace function public.assert_document_signature_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_org uuid;
  doc_status public.document_status;
  version_document uuid;
  file_document uuid;
  file_sha text;
begin
  select organization_id, status into doc_org, doc_status
  from public.documents where id = new.document_id;
  if doc_org is null or doc_org <> new.organization_id then
    raise exception 'signature organization must match its document'
      using errcode = '23514';
  end if;
  if doc_status not in ('issued', 'signed') then
    raise exception 'only issued documents can receive an internal signature'
      using errcode = 'P0001';
  end if;

  select document_id into version_document
  from public.document_versions where id = new.document_version_id;
  if version_document is distinct from new.document_id then
    raise exception 'signature version must belong to the document'
      using errcode = '23514';
  end if;

  select document_id, sha256 into file_document, file_sha
  from public.document_files where id = new.document_file_id;
  if file_document is distinct from new.document_id then
    raise exception 'signature file must belong to the document'
      using errcode = '23514';
  end if;
  if file_sha is distinct from new.document_sha256 then
    raise exception 'signature hash must match the signed PDF'
      using errcode = '23514';
  end if;

  new.professional_user_id := auth.uid();
  new.signature_method := 'virginiapsi_internal';
  return new;
end;
$$;

create trigger document_professional_signatures_assert
  before insert on public.document_professional_signatures
  for each row execute function public.assert_document_signature_consistency();

-- No UPDATE: a signed PDF is immutable. Corrections create a new version.
grant select, insert on public.document_professional_signatures to authenticated;
alter table public.document_professional_signatures enable row level security;

create policy document_signatures_select
  on public.document_professional_signatures for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_professional_signatures.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );

create policy document_signatures_insert
  on public.document_professional_signatures for insert to authenticated
  with check (
    public.is_clinical_practitioner(organization_id)
    and exists (
      select 1 from public.documents d
      where d.id = document_professional_signatures.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );

grant usage on type public.legal_review_status to authenticated;
