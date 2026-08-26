-- Tesseli — Phase 8: Conhecimento Tesseli / RAG local.
--
-- Design decisions not fully pinned down by the docs:
--   * "knowledge clinical" in docs/05-security-rbac-rls.md gives the
--     secretary NENHUM on the whole module — every table here is
--     psychologist_admin-only, the same boundary as Session AI/Supervisor;
--   * knowledge_sources (bibliographic metadata + file + ingestion status)
--     is kept separate from knowledge_documents (the extracted plain text)
--     so re-extracting/re-chunking a source never touches its citation
--     metadata, and a source can exist in 'uploaded'/'failed' status with
--     no document yet;
--   * embeddings are vector(768) — Gemini's embedding models default to
--     3072 dims but explicitly recommend truncating via
--     `outputDimensionality` to 768/1536/3072 with "little loss in
--     quality" (ai.google.dev/gemini-api/docs/embeddings, checked
--     2026-08-20); 768 is the smallest recommended size, keeping index
--     size/query cost down for a single-tenant-at-a-time library;
--   * ai_runs/ai_artifacts (Fase 6) get their purpose/type vocabulary
--     widened again, same mechanism as Fase 7's migration.

create extension if not exists vector;

create type public.knowledge_source_status as enum (
  'uploaded',
  'processing',
  'ready',
  'failed'
);

-- ---------------------------------------------------------------------------
-- knowledge_collections
-- ---------------------------------------------------------------------------

create table public.knowledge_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger knowledge_collections_set_updated_at
  before update on public.knowledge_collections
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.knowledge_collections to authenticated;
alter table public.knowledge_collections enable row level security;

create policy knowledge_collections_admin_select
  on public.knowledge_collections for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_collections_admin_insert
  on public.knowledge_collections for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_collections_admin_update
  on public.knowledge_collections for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_collections_admin_delete
  on public.knowledge_collections for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_sources
-- ---------------------------------------------------------------------------

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  collection_id uuid references public.knowledge_collections (id) on delete set null,
  -- Bibliographic metadata: every field nullable/empty-array on purpose —
  -- docs/16 "Nunca invente fonte, página, capítulo, autor..."; absence is
  -- the correct default, not a placeholder to be filled by inference.
  title text,
  authors text[] not null default '{}',
  year integer,
  edition text,
  document_type text,
  study_design_or_source_role text,
  language text,
  theoretical_approaches text[] not null default '{}',
  population_context text[] not null default '{}',
  main_topics text[] not null default '{}',
  system_tags text[] not null default '{}',
  status public.knowledge_source_status not null default 'uploaded',
  ingestion_error text,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_sources_org_idx on public.knowledge_sources (organization_id, created_at desc);

create trigger knowledge_sources_set_updated_at
  before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

create or replace function public.assert_knowledge_source_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_org uuid;
begin
  if new.collection_id is not null then
    select organization_id into collection_org
    from public.knowledge_collections
    where id = new.collection_id;
    if collection_org is null or collection_org <> new.organization_id then
      raise exception 'knowledge source collection must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.uploaded_by := old.uploaded_by;
    new.organization_id := old.organization_id;
    new.storage_path := old.storage_path;
    new.sha256 := old.sha256;
  end if;

  return new;
end;
$$;

create trigger knowledge_sources_assert_consistency
  before insert or update on public.knowledge_sources
  for each row execute function public.assert_knowledge_source_consistency();

grant select, insert, update, delete on public.knowledge_sources to authenticated;
alter table public.knowledge_sources enable row level security;

create policy knowledge_sources_admin_select
  on public.knowledge_sources for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_sources_admin_insert
  on public.knowledge_sources for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_sources_admin_update
  on public.knowledge_sources for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_sources_admin_delete
  on public.knowledge_sources for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_documents (extracted text, 1:1 with a source)
-- ---------------------------------------------------------------------------

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null unique references public.knowledge_sources (id) on delete cascade,
  extracted_text text not null,
  char_count integer not null default 0,
  extracted_at timestamptz not null default now()
);

create or replace function public.assert_knowledge_document_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_org uuid;
begin
  select organization_id into source_org
  from public.knowledge_sources
  where id = new.source_id;
  if source_org is null or source_org <> new.organization_id then
    raise exception 'knowledge document organization must match its source'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger knowledge_documents_assert_same_org
  before insert or update on public.knowledge_documents
  for each row execute function public.assert_knowledge_document_same_org();

grant select, insert, update, delete on public.knowledge_documents to authenticated;
alter table public.knowledge_documents enable row level security;

create policy knowledge_documents_admin_select
  on public.knowledge_documents for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_documents_admin_insert
  on public.knowledge_documents for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_documents_admin_update
  on public.knowledge_documents for update to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_documents_admin_delete
  on public.knowledge_documents for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_chunks
-- ---------------------------------------------------------------------------

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  text text not null,
  char_start integer,
  char_end integer,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_unique_sequence unique (document_id, sequence)
);

create index knowledge_chunks_source_idx on public.knowledge_chunks (source_id);

create or replace function public.assert_knowledge_chunk_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_org uuid;
  doc_source uuid;
begin
  select organization_id, source_id into doc_org, doc_source
  from public.knowledge_documents
  where id = new.document_id;

  if doc_org is null or doc_org <> new.organization_id then
    raise exception 'knowledge chunk organization must match its document'
      using errcode = '23514';
  end if;
  if doc_source is distinct from new.source_id then
    raise exception 'knowledge chunk source must match its document''s source'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger knowledge_chunks_assert_consistency
  before insert or update on public.knowledge_chunks
  for each row execute function public.assert_knowledge_chunk_consistency();

-- Chunks are regenerated wholesale on re-ingestion, never edited in place —
-- INSERT/DELETE only, no UPDATE grant.
grant select, insert, delete on public.knowledge_chunks to authenticated;
alter table public.knowledge_chunks enable row level security;

create policy knowledge_chunks_admin_select
  on public.knowledge_chunks for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_chunks_admin_insert
  on public.knowledge_chunks for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_chunks_admin_delete
  on public.knowledge_chunks for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- ---------------------------------------------------------------------------
-- knowledge_embeddings
-- ---------------------------------------------------------------------------

create table public.knowledge_embeddings (
  chunk_id uuid primary key references public.knowledge_chunks (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  embedding vector(768) not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index knowledge_embeddings_vector_idx
  on public.knowledge_embeddings
  using hnsw (embedding vector_cosine_ops);

create or replace function public.assert_knowledge_embedding_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chunk_org uuid;
begin
  select organization_id into chunk_org
  from public.knowledge_chunks
  where id = new.chunk_id;
  if chunk_org is null or chunk_org <> new.organization_id then
    raise exception 'knowledge embedding organization must match its chunk'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger knowledge_embeddings_assert_same_org
  before insert or update on public.knowledge_embeddings
  for each row execute function public.assert_knowledge_embedding_same_org();

grant select, insert, delete on public.knowledge_embeddings to authenticated;
alter table public.knowledge_embeddings enable row level security;

create policy knowledge_embeddings_admin_select
  on public.knowledge_embeddings for select to authenticated
  using (public.is_psychologist_admin(organization_id));
create policy knowledge_embeddings_admin_insert
  on public.knowledge_embeddings for insert to authenticated
  with check (public.is_psychologist_admin(organization_id));
create policy knowledge_embeddings_admin_delete
  on public.knowledge_embeddings for delete to authenticated
  using (public.is_psychologist_admin(organization_id));

-- Tenant-scoped vector similarity search. SECURITY INVOKER: the caller's
-- own RLS on knowledge_embeddings/knowledge_chunks/knowledge_sources is
-- what authorizes reading these rows — this function only adds the
-- pgvector ORDER BY/LIMIT that a plain PostgREST filter can't express.
create or replace function public.match_knowledge_chunks(
  org_id uuid,
  query_embedding vector(768),
  match_count integer default 8,
  collection_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  text text,
  char_start integer,
  char_end integer,
  similarity real
)
language sql
stable
security invoker
set search_path = ''
as -- `set search_path = ''` (this codebase's usual hardening for SQL/plpgsql
-- functions) means the infix `<=>`/`<->` operators pgvector registers
-- cannot be found unqualified — they need the explicit OPERATOR() syntax
-- to resolve without a search_path.
$$
  select
    c.id as chunk_id,
    c.source_id,
    c.text,
    c.char_start,
    c.char_end,
    1 - (e.embedding operator(public.<=>) query_embedding) as similarity
  from public.knowledge_embeddings e
  join public.knowledge_chunks c on c.id = e.chunk_id
  join public.knowledge_sources s on s.id = c.source_id
  where e.organization_id = org_id
    and (collection_ids is null or s.collection_id = any (collection_ids))
  order by e.embedding operator(public.<=>) query_embedding
  limit match_count;
$$;

revoke all on function public.match_knowledge_chunks(uuid, vector, integer, uuid[]) from public;
grant execute on function public.match_knowledge_chunks(uuid, vector, integer, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- knowledge-sources storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('knowledge-sources', 'knowledge-sources', false)
on conflict (id) do nothing;

-- Unlike session-audio-fallback, a direct RLS policy is the right tool here:
-- there is no separate consent gate to enforce, only "is this user the
-- psychologist_admin of the organization named in the path's first
-- segment" — exactly what Postgres RLS is for. Path convention:
-- knowledge-sources/{organization_id}/{source_id}/{filename}.
create policy knowledge_sources_storage_admin_all
  on storage.objects for all to authenticated
  using (
    bucket_id = 'knowledge-sources'
    and public.is_psychologist_admin((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'knowledge-sources'
    and public.is_psychologist_admin((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------------
-- ai_runs / ai_artifacts vocabulary widened for Knowledge (same mechanism
-- as Fase 7's migration)
-- ---------------------------------------------------------------------------

alter table public.ai_runs drop constraint ai_runs_purpose_check;
alter table public.ai_runs add constraint ai_runs_purpose_check
  check (purpose in (
    'session_live', 'session_preparation', 'session_closing', 'supervisor',
    'knowledge_query', 'knowledge_synthesis', 'knowledge_compare_sources',
    'knowledge_study_mode', 'knowledge_clinical_application', 'knowledge_ingestion'
  ));

alter table public.ai_artifacts drop constraint ai_artifacts_type_check;
alter table public.ai_artifacts add constraint ai_artifacts_type_check
  check (type in (
    'session_live', 'session_preparation', 'session_closing', 'supervisor',
    'knowledge_query', 'knowledge_synthesis', 'knowledge_compare_sources',
    'knowledge_study_mode', 'knowledge_clinical_application', 'knowledge_ingestion'
  ));
