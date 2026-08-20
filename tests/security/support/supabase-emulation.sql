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

-- Minimal emulation of Supabase Storage's schema, just enough for a
-- project migration to `insert into storage.buckets` and, if it chooses to,
-- add RLS policies on `storage.objects`. Real Supabase manages this schema
-- itself; this harness only needs it to exist so bucket-creation statements
-- in project migrations do not fail against a bare PostgreSQL instance.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
-- Matches real Supabase's baseline: anon/authenticated get table-level
-- GRANTs on storage.objects, and RLS policies the project adds explicitly
-- are the actual enforcement layer (some buckets, like session-audio-fallback,
-- deliberately add none).
grant select, insert, update, delete on storage.objects to anon, authenticated;
alter table storage.objects enable row level security;

-- Real Supabase Storage helper used by path-based RLS policies (splits an
-- object path into its folder segments, excluding the filename).
create or replace function storage.foldername(name text)
returns text[]
language sql
stable
as $$
  select case
    when array_length(string_to_array(name, '/'), 1) > 1
      then (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
    else '{}'::text[]
  end;
$$;
