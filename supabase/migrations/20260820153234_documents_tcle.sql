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
