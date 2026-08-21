-- Tesseli: identification portrait on the administrative patient record.
-- The file lives in bucket `patient-attachments` (signed URLs only, no
-- generic Storage GRANT). The path is constrained to this tenant and this
-- patient so a direct UPDATE cannot point photo_path at another org or
-- another patient's object. The portrait is administrative identity, not
-- clinical content — both psychologist_admin and secretary may set it.

alter table public.patients
  add column photo_path text;

alter table public.patients
  add constraint patients_photo_path_tenant_prefix check (
    photo_path is null
    or photo_path like (organization_id::text || '/' || id::text || '/%')
  );

comment on column public.patients.photo_path is
  'Object path in bucket patient-attachments for the identification portrait. Administrative (visible to secretary). Null when no photo.';
