-- Tesseli — Phase 12: settings, logical export, LGPD elimination job hooks.
-- Specs: prompts/12-settings-backup.md, docs/08-implementation-phases.md,
-- docs/06-integrations.md §5, docs/19-lgpd-privacy.md §5,
-- docs/05-security-rbac-rls.md (settings/security/team = admin only).
--
-- Vault secret *values* are never written here. Operators already provision
-- `tesseli_app_url` and `tesseli_cron_secret` for the Fase 11 scheduler; the
-- audio-retention cron reuses the same names.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.logical_export_scope as enum (
  'organization',
  'patient'
);

create type public.logical_export_status as enum (
  'queued',
  'packing',
  'ready',
  'failed',
  'expired'
);

-- ---------------------------------------------------------------------------
-- logical_exports
-- ---------------------------------------------------------------------------

create table public.logical_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  scope public.logical_export_scope not null,
  patient_id uuid references public.patients (id) on delete set null,
  schema_version text not null default 'tesseli-export-v1'
    check (char_length(btrim(schema_version)) between 1 and 40),
  status public.logical_export_status not null default 'queued',
  storage_path text,
  package_bytes integer check (package_bytes is null or package_bytes >= 0),
  file_count integer check (file_count is null or file_count >= 0),
  package_sha256 text check (package_sha256 is null or package_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  error_code text,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint logical_exports_patient_scope_coherent check (
    (scope = 'patient' and patient_id is not null)
    or (scope = 'organization' and patient_id is null)
  )
);

create index logical_exports_org_requested_idx
  on public.logical_exports (organization_id, requested_at desc);

create trigger logical_exports_set_updated_at
  before update on public.logical_exports
  for each row execute function public.set_updated_at();

create or replace function public.assert_logical_export_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.actor_user_id := old.actor_user_id;
    new.scope := old.scope;
    new.patient_id := old.patient_id;
  end if;

  if new.patient_id is not null then
    select organization_id into patient_org
    from public.patients
    where id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then
      raise exception 'export patient must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if not public.is_psychologist_admin(new.organization_id)
     and (select auth.role()) <> 'service_role' then
    raise exception 'only psychologist_admin may manage logical exports'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger logical_exports_assert_consistency
  before insert or update on public.logical_exports
  for each row execute function public.assert_logical_export_consistency();

alter table public.logical_exports enable row level security;

create policy logical_exports_select_admin on public.logical_exports
  for select to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy logical_exports_insert_admin on public.logical_exports
  for insert to authenticated
  with check (
    public.is_psychologist_admin(organization_id)
    and actor_user_id = auth.uid()
  );

create policy logical_exports_update_admin on public.logical_exports
  for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

-- No DELETE policy / GRANT: expire or mark failed; never erase the fact.

revoke all on public.logical_exports from public, anon;
grant select, insert, update on public.logical_exports to authenticated;
grant select, insert, update on public.logical_exports to service_role;

-- ---------------------------------------------------------------------------
-- Private export bucket: signed download only, after role check in app code.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('tesseli-exports', 'tesseli-exports', false)
on conflict (id) do nothing;

-- Zero storage.objects policies for anon/authenticated: the zip is clinical
-- portability data. Download URLs are minted server-side after the same
-- psychologist_admin check that authorized the export.

-- ---------------------------------------------------------------------------
-- Team: list + invite (email lives in auth.users, not in memberships)
-- ---------------------------------------------------------------------------

create or replace function public.list_organization_members(p_org_id uuid)
returns table (
  id uuid,
  user_id uuid,
  role public.organization_role,
  active boolean,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_psychologist_admin(p_org_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.user_id,
    m.role,
    m.active,
    u.email,
    m.created_at
  from public.organization_members m
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_org_id
  order by m.created_at;
end;
$$;

revoke all on function public.list_organization_members(uuid) from public;
grant execute on function public.list_organization_members(uuid) to authenticated;

create or replace function public.invite_organization_member(
  p_org_id uuid,
  p_email text,
  p_role public.organization_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  membership_id uuid;
begin
  if not public.is_psychologist_admin(p_org_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_email is null or btrim(p_email) = '' or position('@' in p_email) = 0 then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  select u.id into target_user
  from auth.users u
  where lower(u.email) = lower(btrim(p_email));

  if target_user is null then
    raise exception 'user is not registered'
      using errcode = 'P0001';
  end if;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (p_org_id, target_user, p_role, true)
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        active = true
  returning id into membership_id;

  return membership_id;
end;
$$;

revoke all on function public.invite_organization_member(uuid, text, public.organization_role) from public;
grant execute on function public.invite_organization_member(uuid, text, public.organization_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Fallback-audio retention (docs/19-lgpd-privacy.md §3)
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_fallback_audio()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with doomed as (
    select o.id
    from storage.objects o
    join public.practice_settings s
      on (storage.foldername(o.name))[1] = s.organization_id::text
    where o.bucket_id = 'session-audio-fallback'
      and o.created_at < now() - make_interval(days => s.session_audio_fallback_retention_days)
  ),
  gone as (
    delete from storage.objects o
    using doomed
    where o.id = doomed.id
    returning o.id
  )
  select count(*)::integer into deleted_count from gone;

  return coalesce(deleted_count, 0);
end;
$$;

revoke all on function public.purge_expired_fallback_audio() from public;
grant execute on function public.purge_expired_fallback_audio() to service_role;

create or replace function public.expire_stale_logical_exports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.logical_exports
     set status = 'expired'
   where status = 'ready'
     and coalesce(expires_at, ready_at + interval '24 hours') <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.expire_stale_logical_exports() from public;
grant execute on function public.expire_stale_logical_exports() to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler: same Vault names as Fase 11, daily cadence.
-- ---------------------------------------------------------------------------

create or replace function public.invoke_audio_retention_job()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
begin
  begin
    select s.secret into app_url
    from vault.decrypted_secrets s
    where s.name = 'tesseli_app_url';
    select s.secret into cron_secret
    from vault.decrypted_secrets s
    where s.name = 'tesseli_cron_secret';
  exception
    when undefined_table then
      return;
    when invalid_schema_name then
      return;
  end;

  if app_url is null or btrim(app_url) = '' or cron_secret is null or btrim(cron_secret) = '' then
    return;
  end if;

  begin
    perform net.http_post(
      url := rtrim(app_url, '/') || '/api/jobs/audio-retention',
      body := jsonb_build_object('source', 'pg_cron'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', cron_secret
      )
    );
  exception
    when undefined_function then
      return;
    when invalid_schema_name then
      return;
  end;
end;
$$;

revoke all on function public.invoke_audio_retention_job() from public;
grant execute on function public.invoke_audio_retention_job() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      perform cron.schedule(
        'tesseli-audio-retention',
        '0 3 * * *',
        'select public.invoke_audio_retention_job()'
      );
    end if;
  end if;
exception
  when others then
    null;
end;
$$;
