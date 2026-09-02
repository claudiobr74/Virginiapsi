-- VirgíniaPsi — compatibility layer for the historical AI review lifecycle.
--
-- Clinical content may only be moved into DPEP/working notes by
-- append_verified_ai_artifact_to_session(), which validates tenant, patient,
-- session and optimistic version atomically. This trigger keeps the older
-- review metadata contract compatible: an explicit clinician UPDATE may mark
-- an artifact reviewed/appended, but that metadata change alone writes no
-- clinical session content.

create or replace function public.assert_ai_artifact_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_org uuid;
begin
  select organization_id into run_org
  from public.ai_runs
  where id = new.run_id;

  if run_org is null or run_org <> new.organization_id then
    raise exception 'ai_artifacts organization must match its ai_run'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_status := 'pending';
  elsif tg_op = 'UPDATE' then
    -- Model output identity/content is immutable after creation. Only review
    -- metadata may change here; applying content to a clinical session is a
    -- separate, verified RPC operation.
    new.structured_content := old.structured_content;
    new.type := old.type;
    new.run_id := old.run_id;
    new.organization_id := old.organization_id;

    if new.review_status <> old.review_status
       and old.review_status <> 'pending' then
      raise exception 'ai_artifacts review_status cannot change once reviewed'
        using errcode = '42501';
    end if;

    if new.review_status <> 'pending' then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

comment on function public.assert_ai_artifact_same_org() is
  'Keeps AI artifact content immutable and stamps human review metadata. Clinical writes must use append_verified_ai_artifact_to_session().';
