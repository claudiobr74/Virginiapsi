-- Incremental apply for the hosted project that already ran hosted-schema.bundle.sql.
-- Safe to re-run: IF NOT EXISTS equivalent via a DO block.

alter table public.patients
  add column if not exists photo_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_photo_path_tenant_prefix'
  ) then
    alter table public.patients
      add constraint patients_photo_path_tenant_prefix check (
        photo_path is null
        or photo_path like (organization_id::text || '/' || id::text || '/%')
      );
  end if;
end
$$;

comment on column public.patients.photo_path is
  'Object path in bucket patient-attachments for the identification portrait. Administrative (visible to secretary). Null when no photo.';
