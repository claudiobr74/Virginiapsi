-- VirgíniaPsi — AI artifact isolation (clinical integrity).
-- Closing artifacts are session-specific. Supervisor artifacts may attach
-- to another session of the SAME patient, never across patients or tenants.
-- Append of review_status='appended' is allowed only through this RPC so
-- DPEP/working-notes + artifact status + audit stay in one transaction.

create type public.ai_artifact_append_mode as enum (
  'session_closing',
  'supervisor'
);

-- ---------------------------------------------------------------------------
-- Guard: review_status can become 'appended' only when the transactional
-- RPC sets tesseli.append_artifact=1 for the current transaction.
-- ---------------------------------------------------------------------------

create or replace function public.assert_ai_artifact_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_org uuid;
begin
  select organization_id into run_org from public.ai_runs where id = new.run_id;
  if run_org is null or run_org <> new.organization_id then
    raise exception 'ai_artifacts organization must match its ai_run'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_status := 'pending';
  elsif tg_op = 'UPDATE' then
    new.structured_content := old.structured_content;
    new.type := old.type;
    new.run_id := old.run_id;
    new.organization_id := old.organization_id;
    if new.review_status <> old.review_status and old.review_status <> 'pending' then
      raise exception 'ai_artifacts review_status cannot change once reviewed'
        using errcode = '42501';
    end if;
    if new.review_status = 'appended'
       and old.review_status is distinct from 'appended'
       and current_setting('tesseli.append_artifact', true) is distinct from '1' then
      raise exception 'ai_artifacts can only be appended via append_verified_ai_artifact_to_session'
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

create or replace function public.append_verified_ai_artifact_to_session(
  p_artifact_id uuid,
  p_target_session_id uuid,
  p_expected_version integer,
  p_mode public.ai_artifact_append_mode,
  p_include_formulation boolean default false,
  p_include_hypotheses boolean default false
)
returns table (new_version integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  sess record;
  artifact_row record;
  run_row record;
  dpep_draft jsonb;
  current_notes record;
  appended_formulation text;
  appended_hypotheses text;
  bumped integer;
  synthesis text;
  hypotheses_text text;
begin
  if auth.uid() is null then
    raise exception 'append_verified_ai_artifact_to_session requires authentication'
      using errcode = '42501';
  end if;

  select
    cs.id,
    cs.organization_id,
    cs.patient_id,
    cs.version
    into sess
  from public.clinical_sessions cs
  where cs.id = p_target_session_id;

  if sess.id is null then
    raise exception 'target session not found'
      using errcode = 'P0002';
  end if;

  if not public.can_access_clinical_session(sess.organization_id, sess.id) then
    raise exception 'not authorized to append AI artifacts to this session'
      using errcode = '42501';
  end if;

  select
    a.id,
    a.organization_id,
    a.run_id,
    a.type,
    a.structured_content,
    a.review_status
    into artifact_row
  from public.ai_artifacts a
  where a.id = p_artifact_id;

  if artifact_row.id is null then
    raise exception 'ai artifact not found'
      using errcode = 'P0002';
  end if;

  select
    r.id,
    r.organization_id,
    r.patient_id,
    r.session_id,
    r.purpose
    into run_row
  from public.ai_runs r
  where r.id = artifact_row.run_id;

  if run_row.id is null then
    raise exception 'ai run not found'
      using errcode = 'P0002';
  end if;

  if artifact_row.organization_id is distinct from sess.organization_id
     or run_row.organization_id is distinct from sess.organization_id then
    raise exception 'ai_artifact_isolation_violation: organization mismatch'
      using errcode = 'P0001';
  end if;

  if run_row.patient_id is distinct from sess.patient_id then
    raise exception 'ai_artifact_isolation_violation: patient mismatch'
      using errcode = 'P0001';
  end if;

  if artifact_row.review_status <> 'pending' then
    raise exception 'ai artifact already reviewed'
      using errcode = 'P0001';
  end if;

  if p_mode = 'session_closing' then
    if artifact_row.type <> 'session_closing' or run_row.purpose <> 'session_closing' then
      raise exception 'ai_artifact_isolation_violation: closing artifact type mismatch'
        using errcode = 'P0001';
    end if;
    if run_row.session_id is distinct from sess.id then
      raise exception 'ai_artifact_isolation_violation: closing artifact is session-specific'
        using errcode = 'P0001';
    end if;
  elsif p_mode = 'supervisor' then
    if artifact_row.type <> 'supervisor' or run_row.purpose <> 'supervisor' then
      raise exception 'ai_artifact_isolation_violation: supervisor artifact type mismatch'
        using errcode = 'P0001';
    end if;
    -- Cross-session is allowed for Supervisor only while the patient is
    -- identical. A bound session_id, when present, must still match.
    if run_row.session_id is not null and run_row.session_id is distinct from sess.id then
      raise exception 'ai_artifact_isolation_violation: supervisor artifact bound to another session'
        using errcode = 'P0001';
    end if;
    if not p_include_formulation and not p_include_hypotheses then
      raise exception 'supervisor append requires at least one field'
        using errcode = '22023';
    end if;
  end if;

  perform set_config('tesseli.append_artifact', '1', true);

  if p_mode = 'session_closing' then
    dpep_draft := artifact_row.structured_content -> 'dpepDraft';

    update public.clinical_sessions
    set version = version + 1
    where id = sess.id
      and organization_id = sess.organization_id
      and version = p_expected_version
    returning version into bumped;

    if bumped is null then
      return;
    end if;

    insert into public.session_dpep (
      session_id, organization_id, demand, procedures, evolution, plan,
      version, updated_by
    )
    values (
      sess.id,
      sess.organization_id,
      nullif(dpep_draft ->> 'demanda', ''),
      nullif(dpep_draft ->> 'procedimentos', ''),
      nullif(dpep_draft ->> 'evolucao', ''),
      nullif(dpep_draft ->> 'plano', ''),
      bumped,
      auth.uid()
    )
    on conflict (session_id) do update set
      demand = excluded.demand,
      procedures = excluded.procedures,
      evolution = excluded.evolution,
      plan = excluded.plan,
      version = excluded.version,
      updated_by = excluded.updated_by;
  else
    select formulation, hypotheses, working_observations
      into current_notes
    from public.session_clinical_working_notes
    where session_id = sess.id;

    synthesis := coalesce(artifact_row.structured_content ->> 'clinicalSynthesis', '');
    hypotheses_text := (
      select string_agg('[Supervisor IA] ' || hyp, E'\n')
      from (
        select jsonb_array_elements(coalesce(artifact_row.structured_content -> 'hypotheses', '[]'::jsonb))
          ->> 'hypothesis' as hyp
      ) h
      where hyp is not null and length(btrim(hyp)) > 0
    );

    appended_formulation := current_notes.formulation;
    if p_include_formulation then
      appended_formulation := nullif(
        concat_ws(E'\n\n', current_notes.formulation, nullif('[Supervisor IA] ' || synthesis, '[Supervisor IA] ')),
        ''
      );
    end if;

    appended_hypotheses := current_notes.hypotheses;
    if p_include_hypotheses then
      appended_hypotheses := nullif(
        concat_ws(E'\n\n', current_notes.hypotheses, hypotheses_text),
        ''
      );
    end if;

    update public.clinical_sessions
    set version = version + 1
    where id = sess.id
      and organization_id = sess.organization_id
      and version = p_expected_version
    returning version into bumped;

    if bumped is null then
      return;
    end if;

    insert into public.session_clinical_working_notes (
      session_id, organization_id, formulation, hypotheses,
      working_observations, updated_by
    )
    values (
      sess.id,
      sess.organization_id,
      appended_formulation,
      appended_hypotheses,
      current_notes.working_observations,
      auth.uid()
    )
    on conflict (session_id) do update set
      formulation = excluded.formulation,
      hypotheses = excluded.hypotheses,
      working_observations = excluded.working_observations,
      updated_by = excluded.updated_by;
  end if;

  update public.ai_artifacts
  set review_status = 'appended'
  where id = artifact_row.id
    and review_status = 'pending';

  perform public.log_audit_event(
    sess.organization_id,
    case
      when p_mode = 'session_closing' then 'ai_artifact.appended_to_dpep'
      else 'ai_artifact.appended_to_working_notes'
    end,
    'clinical_session',
    sess.id::text,
    jsonb_build_object(
      'artifact_id', artifact_row.id::text,
      'mode', p_mode::text,
      'patient_id', sess.patient_id::text
    )
  );

  return query select bumped;
end;
$$;

comment on function public.append_verified_ai_artifact_to_session(uuid, uuid, integer, public.ai_artifact_append_mode, boolean, boolean) is
  'Atomic human-in-the-loop append of a verified AI artifact. Rejects cross-patient and cross-tenant IDs. Closing artifacts are session-specific.';

revoke all on function public.append_verified_ai_artifact_to_session(uuid, uuid, integer, public.ai_artifact_append_mode, boolean, boolean) from public;
grant execute on function public.append_verified_ai_artifact_to_session(uuid, uuid, integer, public.ai_artifact_append_mode, boolean, boolean) to authenticated;
grant usage on type public.ai_artifact_append_mode to authenticated;
