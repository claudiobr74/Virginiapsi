-- Tesseli: professional identification photo on practice_settings.
-- The column already exists (tenancy_core); this migration constrains the
-- object key to the tenant prefix and exposes it on the member-visible shell
-- projection. Bytes live in private bucket `practice-assets` and are read
-- through short-lived signed URLs minted after TypeScript authorization.
-- Zero storage.objects policies for anon/authenticated (same pattern as
-- patient-attachments / document-branding).

alter table public.practice_settings
  drop constraint if exists practice_settings_photo_path_tenant_prefix;

alter table public.practice_settings
  add constraint practice_settings_photo_path_tenant_prefix check (
    photo_path is null
    or (
      photo_path like (organization_id::text || '/%')
      and position('..' in photo_path) = 0
    )
  );

comment on column public.practice_settings.photo_path is
  'Object path in bucket practice-assets for the professional portrait shown on Meu Dia. Administrative to write; members read the path via organization_shell_settings and the server mints a signed URL. Null when no photo.';

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
  quote text,
  photo_path text
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
    s.quote,
    s.photo_path
  from public.organizations o
  left join public.practice_settings s on s.organization_id = o.id
  where o.id = org_id
    and public.is_org_member(org_id);
$$;

revoke all on function public.organization_shell_settings(uuid) from public;
grant execute on function public.organization_shell_settings(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('practice-assets', 'practice-assets', false)
on conflict (id) do nothing;
