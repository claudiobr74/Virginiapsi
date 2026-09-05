-- Tesseli: split practice tax ids and daily quote mode.
-- Inspected live Virginiapsi practice_settings (2026-09-01): tax_id exists;
-- professional_cpf, company_cnpj and quote_mode do not. tax_id is kept as
-- legacy. Backfill classifies by digit length only and never overwrites a
-- non-null new column. quote_mode is projected on organization_shell_settings
-- so Meu Dia can resolve the daily quote for every member without reading
-- fiscal fields.

alter table public.practice_settings
  add column if not exists professional_cpf text;

alter table public.practice_settings
  add column if not exists company_cnpj text;

alter table public.practice_settings
  add column if not exists quote_mode text;

update public.practice_settings
set professional_cpf = regexp_replace(tax_id, '\D', '', 'g')
where professional_cpf is null
  and length(regexp_replace(coalesce(tax_id, ''), '\D', '', 'g')) = 11;

update public.practice_settings
set company_cnpj = regexp_replace(tax_id, '\D', '', 'g')
where company_cnpj is null
  and length(regexp_replace(coalesce(tax_id, ''), '\D', '', 'g')) = 14;

update public.practice_settings
set quote_mode = 'daily'
where quote_mode is null;

alter table public.practice_settings
  alter column quote_mode set default 'daily';

alter table public.practice_settings
  alter column quote_mode set not null;

alter table public.practice_settings
  drop constraint if exists practice_settings_professional_cpf_digits;
alter table public.practice_settings
  add constraint practice_settings_professional_cpf_digits check (
    professional_cpf is null or professional_cpf ~ '^[0-9]{11}$'
  );

alter table public.practice_settings
  drop constraint if exists practice_settings_company_cnpj_digits;
alter table public.practice_settings
  add constraint practice_settings_company_cnpj_digits check (
    company_cnpj is null or company_cnpj ~ '^[0-9]{14}$'
  );

alter table public.practice_settings
  drop constraint if exists practice_settings_quote_mode_check;
alter table public.practice_settings
  add constraint practice_settings_quote_mode_check check (
    quote_mode in ('daily', 'custom')
  );

comment on column public.practice_settings.professional_cpf is
  'Digits-only CPF of the professional. Optional. Legacy mixed values remain in tax_id.';
comment on column public.practice_settings.company_cnpj is
  'Digits-only CNPJ of the clinic. Optional. Independent from professional_cpf.';
comment on column public.practice_settings.quote_mode is
  'daily = deterministic quote from the in-code bank by organization local date; custom = practice_settings.quote. No daily UPDATE.';
comment on column public.practice_settings.tax_id is
  'Legacy mixed CPF/CNPJ. Not shown on new Settings screens. Kept for compatibility; do not delete.';

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
    s.quote_mode,
    s.photo_path
  from public.organizations o
  left join public.practice_settings s on s.organization_id = o.id
  where o.id = org_id
    and public.is_org_member(org_id);
$$;

revoke all on function public.organization_shell_settings(uuid) from public;
grant execute on function public.organization_shell_settings(uuid) to authenticated;
