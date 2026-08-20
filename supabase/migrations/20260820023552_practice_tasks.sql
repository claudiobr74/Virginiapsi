-- SerenaPsi — Phase 5: practice_tasks for the Meu Dia operational dashboard.
-- Specs: docs/01-product-spec.md §4, docs/08-implementation-phases.md Fase 5,
-- prompts/05-myday.md.
--
-- Tasks are a lightweight operational list (not clinical content). Both
-- psychologist_admin and secretary have full CRUD within their organization —
-- matching the "Meu Dia" operational nature of the screen.
--
-- Also extends organization_shell_settings() to surface greeting_prefix and
-- quote — non-sensitive personalization used by Meu Dia's greeting block.
-- Secretaries already read the shell projection; these two columns are not
-- administrative/financial settings and belong in the same minimized surface.

-- ---------------------------------------------------------------------------
-- practice_tasks
-- ---------------------------------------------------------------------------

create table public.practice_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  title text not null
    check (char_length(btrim(title)) between 1 and 200),
  notes text
    check (notes is null or char_length(notes) <= 2000),
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.practice_tasks is
  'Operational checklist for Meu Dia. Not clinical content — both roles have CRUD within the organization.';

create index practice_tasks_organization_open_idx
  on public.practice_tasks (organization_id, completed_at, due_at)
  where completed_at is null;

create trigger practice_tasks_set_updated_at
  before update on public.practice_tasks
  for each row execute function public.set_updated_at();

-- Stamp created_by from auth.uid() so a client cannot forge authorship.
create or replace function public.assert_practice_task_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by_user_id := old.created_by_user_id;
  end if;
  return new;
end;
$$;

create trigger practice_tasks_assert_created_by
  before insert or update on public.practice_tasks
  for each row execute function public.assert_practice_task_created_by();

grant select, insert, update, delete on public.practice_tasks to authenticated;

alter table public.practice_tasks enable row level security;

create policy practice_tasks_select_members
  on public.practice_tasks
  for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy practice_tasks_insert_members
  on public.practice_tasks
  for insert
  to authenticated
  with check (public.is_org_member(organization_id));

create policy practice_tasks_update_members
  on public.practice_tasks
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy practice_tasks_delete_members
  on public.practice_tasks
  for delete
  to authenticated
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Shell settings: expose greeting_prefix + quote for Meu Dia.
-- CREATE OR REPLACE cannot change a function's OUT columns, so drop first.
-- ---------------------------------------------------------------------------

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
  quote text
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
    s.quote
  from public.organizations o
  left join public.practice_settings s on s.organization_id = o.id
  where o.id = org_id
    and public.is_org_member(org_id);
$$;

revoke all on function public.organization_shell_settings(uuid) from public;
grant execute on function public.organization_shell_settings(uuid) to authenticated;
