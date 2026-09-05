-- Document Studio V3 — identidade visual, workflow, entrega e storage.
-- Specs: DOCUMENT_STUDIO_CURRENT_STATE.md, master prompt Document Studio V3.
-- Does not edit previously applied migrations.
--
-- Sensitivity:
--   parecer → always clinical
--   autorizacao | requerimento | protocolo → always administrative
-- Secretary never reads clinical rows (can_access_document).
-- Branding/logos are organizational identity, not clinical content.

-- ---------------------------------------------------------------------------
-- documents: studio columns
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists system_template_key text,
  add column if not exists visual_profile text not null default 'clinica'
    check (visual_profile in ('essencial', 'clinica', 'institucional', 'premium')),
  add column if not exists logo_mode text not null default 'clinic_default'
    check (logo_mode in ('clinic_default', 'principal', 'horizontal', 'profissional', 'none')),
  add column if not exists logo_align text not null default 'left'
    check (logo_align in ('left', 'center', 'right')),
  add column if not exists logo_size text not null default 'medium'
    check (logo_size in ('small', 'medium', 'large', 'custom')),
  add column if not exists logo_custom_max_pt integer
    check (logo_custom_max_pt is null or logo_custom_max_pt between 24 and 140),
  add column if not exists recipient_name text,
  add column if not exists purpose text,
  add column if not exists structured_data jsonb not null default '{}'::jsonb,
  add column if not exists drafting_mode text not null default 'manual'
    check (drafting_mode in ('manual', 'ai_assisted')),
  add column if not exists length_preset text not null default 'completo'
    check (length_preset in ('objetivo', 'completo', 'detalhado')),
  add column if not exists tone text not null default 'tecnico_clinico'
    check (tone in ('tecnico_clinico', 'interdisciplinar', 'formal', 'institucional', 'objetivo')),
  add column if not exists cover_enabled boolean not null default false,
  add column if not exists layout_format text not null default 'tradicional'
    check (layout_format in ('tradicional', 'livreto')),
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_sha256 text;

alter table public.documents drop constraint if exists documents_issued_has_timestamp;
alter table public.documents
  add constraint documents_issued_has_timestamp check (
    status not in (
      'issued',
      'signed',
      'signature_pending',
      'externally_signed',
      'delivered'
    )
    or issued_at is not null
  );

alter table public.document_versions
  add column if not exists sections_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists content_sha256 text;

alter table public.document_templates
  add column if not exists description text not null default '',
  add column if not exists category text not null default 'outros',
  add column if not exists source_system_template_key text,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists body_sections jsonb not null default '[]'::jsonb;

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
    if new.document_kind in (
      'laudo', 'relatorio', 'atestado', 'encaminhamento', 'parecer'
    ) then
      new.sensitivity := 'clinical';
    elsif new.document_kind in (
      'recibo', 'autorizacao', 'requerimento', 'protocolo'
    ) then
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
    -- Issued versions are never rewritten in place: body lives in
    -- document_versions (append-only). Studio metadata may still change
    -- for delivery/review flags on the parent row.
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- document_branding (1:1 organization identity for documents)
-- ---------------------------------------------------------------------------

create table public.document_branding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  clinic_name text,
  trade_name text,
  legal_name text,
  address_line text,
  city text,
  state text,
  postal_code text,
  phone text,
  email text,
  website text,
  tax_id text,
  professional_name text,
  crp text,
  crp_state text,
  professional_title text,
  qualifications text,
  professional_phone text,
  professional_email text,
  show_clinic_name boolean not null default true,
  show_trade_name boolean not null default false,
  show_legal_name boolean not null default false,
  show_address boolean not null default true,
  show_city boolean not null default true,
  show_phone boolean not null default true,
  show_email boolean not null default true,
  show_website boolean not null default false,
  show_tax_id boolean not null default false,
  header_logo boolean not null default true,
  header_clinic boolean not null default true,
  header_professional boolean not null default true,
  header_crp boolean not null default true,
  header_phone boolean not null default false,
  header_email boolean not null default false,
  header_address boolean not null default false,
  header_website boolean not null default false,
  footer_clinic boolean not null default true,
  footer_professional boolean not null default true,
  footer_crp boolean not null default true,
  footer_phone boolean not null default false,
  footer_email boolean not null default false,
  footer_address boolean not null default false,
  footer_website boolean not null default false,
  footer_page_numbers boolean not null default true,
  footer_document_id boolean not null default true,
  footer_version boolean not null default true,
  footer_hash boolean not null default false,
  color_primary text not null default '#3a4f43',
  color_secondary text not null default '#8a8f8a',
  color_headings text not null default '#171816',
  color_dividers text not null default '#c5d0c6',
  typography_preset text not null default 'classica'
    check (typography_preset in ('classica', 'moderna', 'institucional', 'editorial')),
  letterhead_preset text not null default 'clinico'
    check (letterhead_preset in ('clinico', 'minimalista', 'institucional', 'profissional', 'premium')),
  default_visual_profile text not null default 'clinica'
    check (default_visual_profile in ('essencial', 'clinica', 'institucional', 'premium')),
  category_profile_map jsonb not null default '{
    "declaracao":"essencial",
    "encaminhamento":"clinica",
    "relatorio":"clinica",
    "laudo":"premium",
    "parecer":"premium",
    "contrato":"institucional",
    "atestado":"clinica",
    "autorizacao":"institucional",
    "requerimento":"essencial",
    "protocolo":"essencial"
  }'::jsonb,
  default_logo_id uuid,
  cancellation_notice_hours integer not null default 24
    check (cancellation_notice_hours between 1 and 168),
  adjustment_cadence text not null default 'anual'
    check (adjustment_cadence in ('anual', 'semestral', 'outro', 'nao_definido')),
  include_ai_informative_clause boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger document_branding_set_updated_at
  before update on public.document_branding
  for each row execute function public.set_updated_at();

grant select, insert, update on public.document_branding to authenticated;
alter table public.document_branding enable row level security;

create policy document_branding_select
  on public.document_branding for select to authenticated
  using (public.is_org_member(organization_id));
create policy document_branding_admin_insert
  on public.document_branding for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy document_branding_admin_update
  on public.document_branding for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- document_logos
-- ---------------------------------------------------------------------------

create table public.document_logos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  variant text not null
    check (variant in (
      'principal', 'horizontal', 'compacta', 'monocromatica', 'profissional', 'outra'
    )),
  label text not null default '',
  storage_path text not null,
  print_storage_path text,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 2097152),
  sha256 text not null,
  width_px integer,
  height_px integer,
  is_default boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_logos_org_idx on public.document_logos (organization_id, created_at desc);

create trigger document_logos_set_updated_at
  before update on public.document_logos
  for each row execute function public.set_updated_at();

create or replace function public.assert_document_logo_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.created_by := old.created_by;
  end if;
  if new.mime_type not in (
    'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'
  ) then
    raise exception 'unsupported logo mime type'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger document_logos_assert_consistency
  before insert or update on public.document_logos
  for each row execute function public.assert_document_logo_consistency();

-- At most one default logo per organization.
create unique index document_logos_one_default_idx
  on public.document_logos (organization_id)
  where is_default;

grant select, insert, update, delete on public.document_logos to authenticated;
alter table public.document_logos enable row level security;

create policy document_logos_select
  on public.document_logos for select to authenticated
  using (public.is_org_member(organization_id));
create policy document_logos_admin_insert
  on public.document_logos for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy document_logos_admin_update
  on public.document_logos for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy document_logos_admin_delete
  on public.document_logos for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

alter table public.document_branding
  add constraint document_branding_default_logo_fk
  foreign key (default_logo_id) references public.document_logos (id) on delete set null;

-- ---------------------------------------------------------------------------
-- document_visual_profiles (org overrides of the four canonical profiles)
-- ---------------------------------------------------------------------------

create table public.document_visual_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_key text not null
    check (profile_key in ('essencial', 'clinica', 'institucional', 'premium')),
  letterhead_preset text not null
    check (letterhead_preset in ('clinico', 'minimalista', 'institucional', 'profissional', 'premium')),
  typography_preset text not null
    check (typography_preset in ('classica', 'moderna', 'institucional', 'editorial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_visual_profiles_unique unique (organization_id, profile_key)
);

create trigger document_visual_profiles_set_updated_at
  before update on public.document_visual_profiles
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.document_visual_profiles to authenticated;
alter table public.document_visual_profiles enable row level security;

create policy document_visual_profiles_select
  on public.document_visual_profiles for select to authenticated
  using (public.is_org_member(organization_id));
create policy document_visual_profiles_admin_write
  on public.document_visual_profiles for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy document_visual_profiles_admin_update
  on public.document_visual_profiles for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy document_visual_profiles_admin_delete
  on public.document_visual_profiles for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- document_template_favorites
-- ---------------------------------------------------------------------------

create table public.document_template_favorites (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  template_key text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, template_key)
);

grant select, insert, delete on public.document_template_favorites to authenticated;
alter table public.document_template_favorites enable row level security;

create policy document_template_favorites_select
  on public.document_template_favorites for select to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );
create policy document_template_favorites_insert
  on public.document_template_favorites for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );
create policy document_template_favorites_delete
  on public.document_template_favorites for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- document_delivery
-- ---------------------------------------------------------------------------

create table public.document_delivery (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 200),
  delivered_at timestamptz not null,
  method text not null
    check (method in ('presencial', 'download_seguro', 'email', 'outro')),
  receipt_confirmed boolean not null default false,
  devolution_done boolean not null default false,
  devolution_at timestamptz,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index document_delivery_document_idx on public.document_delivery (document_id, created_at desc);

create or replace function public.assert_document_delivery_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_org uuid;
  doc_sensitivity public.document_sensitivity;
  doc_patient uuid;
begin
  select organization_id, sensitivity, patient_id
    into doc_org, doc_sensitivity, doc_patient
  from public.documents
  where id = new.document_id;

  if doc_org is null or doc_org <> new.organization_id then
    raise exception 'delivery organization must match its document'
      using errcode = '23514';
  end if;

  if not public.can_access_document(doc_org, doc_patient, doc_sensitivity) then
    raise exception 'not authorized to register delivery for this document'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger document_delivery_assert_consistency
  before insert on public.document_delivery
  for each row execute function public.assert_document_delivery_consistency();

grant select, insert on public.document_delivery to authenticated;
alter table public.document_delivery enable row level security;

create policy document_delivery_select
  on public.document_delivery for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_delivery.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );
create policy document_delivery_insert
  on public.document_delivery for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_delivery.document_id
        and d.organization_id = document_delivery.organization_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );

-- ---------------------------------------------------------------------------
-- document_external_signature_metadata (architecture only — no provider)
-- ---------------------------------------------------------------------------

create table public.document_external_signature_metadata (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  document_version_id uuid not null references public.document_versions (id) on delete cascade,
  method text not null
    check (method in ('manual', 'govbr_external', 'icp_external', 'other_verified')),
  registered_at timestamptz not null default now(),
  notes text,
  evidence_storage_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.assert_document_external_signature_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_org uuid;
  doc_sensitivity public.document_sensitivity;
  doc_patient uuid;
  ver_doc uuid;
begin
  select organization_id, sensitivity, patient_id
    into doc_org, doc_sensitivity, doc_patient
  from public.documents
  where id = new.document_id;

  if doc_org is null or doc_org <> new.organization_id then
    raise exception 'external signature organization must match its document'
      using errcode = '23514';
  end if;

  select document_id into ver_doc
  from public.document_versions
  where id = new.document_version_id;
  if ver_doc is null or ver_doc <> new.document_id then
    raise exception 'external signature version must belong to the document'
      using errcode = '23514';
  end if;

  if not public.can_access_document(doc_org, doc_patient, doc_sensitivity) then
    raise exception 'not authorized to register external signature metadata'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger document_external_signature_assert_consistency
  before insert on public.document_external_signature_metadata
  for each row execute function public.assert_document_external_signature_consistency();

grant select, insert on public.document_external_signature_metadata to authenticated;
alter table public.document_external_signature_metadata enable row level security;

create policy document_external_signature_select
  on public.document_external_signature_metadata for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_external_signature_metadata.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );
create policy document_external_signature_insert
  on public.document_external_signature_metadata for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_external_signature_metadata.document_id
        and d.organization_id = document_external_signature_metadata.organization_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: private branding bucket (same signed-URL pattern as clinical-documents)
-- ---------------------------------------------------------------------------

-- Zero storage.objects policies for anon/authenticated: logos are written and
-- read via short-lived signed URLs minted by the server after TypeScript
-- authorization (same pattern as clinical-documents).

insert into storage.buckets (id, name, public)
values ('document-branding', 'document-branding', false)
on conflict (id) do nothing;

revoke all on function public.assert_document_logo_consistency() from public;
revoke all on function public.assert_document_delivery_consistency() from public;
revoke all on function public.assert_document_external_signature_consistency() from public;
