-- Emulates what a real Supabase project already provides before the project's
-- own migrations run: the auth schema, auth.users and the auth.* claim
-- helpers, plus the API roles PostgREST switches into.
--
-- This exists so RLS policies can be exercised against a real PostgreSQL
-- instance (no Docker/local Supabase available in this environment). It is a
-- test harness only — it is never applied to a real project, where these
-- objects are managed by Supabase itself.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase's implementations: claims are read from the request-scoped
-- settings PostgREST sets after it has validated the JWT signature.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;

grant usage on schema auth to anon, authenticated, service_role;
