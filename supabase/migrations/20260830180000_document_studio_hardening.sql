-- Document Studio — template sensitivity, org-prefixed logos, branding FK org.
-- Does not edit previously applied migrations.

create or replace function public.assert_document_template_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_kind in (
    'laudo', 'relatorio', 'atestado', 'encaminhamento', 'parecer'
  ) then
    new.default_sensitivity := 'clinical';
  elsif new.document_kind in (
    'recibo', 'autorizacao', 'requerimento', 'protocolo'
  ) then
    new.default_sensitivity := 'administrative';
  elsif new.default_sensitivity is null then
    raise exception 'sensitivity must be chosen explicitly for this document_kind'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists document_templates_assert_consistency on public.document_templates;
create trigger document_templates_assert_consistency
  before insert or update on public.document_templates
  for each row execute function public.assert_document_template_consistency();

revoke all on function public.assert_document_template_consistency() from public;

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
  if new.storage_path is null
     or position(new.organization_id::text || '/' in new.storage_path) <> 1
     or position('..' in new.storage_path) > 0 then
    raise exception 'logo storage_path must be org-prefixed'
      using errcode = '23514';
  end if;
  if new.print_storage_path is not null
     and (
       position(new.organization_id::text || '/' in new.print_storage_path) <> 1
       or position('..' in new.print_storage_path) > 0
     ) then
    raise exception 'logo print_storage_path must be org-prefixed'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.assert_document_branding_logo_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  logo_org uuid;
begin
  if new.default_logo_id is not null then
    select organization_id into logo_org
    from public.document_logos
    where id = new.default_logo_id;
    if logo_org is null or logo_org <> new.organization_id then
      raise exception 'default logo must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists document_branding_assert_logo_org on public.document_branding;
create trigger document_branding_assert_logo_org
  before insert or update on public.document_branding
  for each row execute function public.assert_document_branding_logo_org();

revoke all on function public.assert_document_branding_logo_org() from public;

create or replace function public.assert_document_visual_profile_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists document_visual_profiles_assert_consistency on public.document_visual_profiles;
create trigger document_visual_profiles_assert_consistency
  before insert or update on public.document_visual_profiles
  for each row execute function public.assert_document_visual_profile_consistency();

revoke all on function public.assert_document_visual_profile_consistency() from public;

update storage.buckets
  set public = false
  where id = 'document-branding' and public is distinct from false;
