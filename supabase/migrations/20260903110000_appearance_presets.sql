-- VirgíniaPsi visual presets. The value is practice-level and intentionally
-- exposed by organization_shell_settings so every authenticated org member
-- receives the same non-sensitive UI preference without widening RLS on
-- practice_settings.

alter table public.practice_settings
  add column if not exists appearance_preset text;

update public.practice_settings
set appearance_preset = 'sage'
where appearance_preset is null;

alter table public.practice_settings
  alter column appearance_preset set default 'sage';

alter table public.practice_settings
  alter column appearance_preset set not null;

alter table public.practice_settings
  drop constraint if exists practice_settings_appearance_preset_check;
alter table public.practice_settings
  add constraint practice_settings_appearance_preset_check check (
    appearance_preset in ('sage', 'serene', 'warm', 'essential')
  );

comment on column public.practice_settings.appearance_preset is
  'Practice-level VirgíniaPsi design preset. Independent from the per-device light/dark mode.';

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
  quote_mode text,
  photo_path text,
  appearance_preset text
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
    s.quote_mode,
    s.photo_path,
    coalesce(s.appearance_preset, 'sage')
  from public.organizations o
  left join public.practice_settings s on s.organization_id = o.id
  where o.id = org_id
    and public.is_org_member(org_id);
$$;

revoke all on function public.organization_shell_settings(uuid) from public;
grant execute on function public.organization_shell_settings(uuid) to authenticated;
