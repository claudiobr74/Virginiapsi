-- VirgíniaPsi — Patient Elimination Plan (LGPD).
-- Policies are explicit (DELETE / ANONYMIZE / RETAIN_WITH_LEGAL_REASON).
-- Legal basis keys are configurable placeholders, not automatic legal advice.

create table public.patient_data_class_policies (
  data_class text primary key,
  policy text not null
    check (policy in ('DELETE', 'ANONYMIZE', 'RETAIN_WITH_LEGAL_REASON')),
  legal_basis_key text,
  retention_years integer check (retention_years is null or retention_years >= 0),
  review_years integer check (review_years is null or review_years >= 0),
  notes text not null default ''
);

insert into public.patient_data_class_policies
  (data_class, policy, legal_basis_key, retention_years, review_years, notes)
values
  ('patient_identifiers', 'ANONYMIZE', null, null, null, 'Nome, e-mail, telefone, CPF, nascimento, responsáveis.'),
  ('patient_photo', 'DELETE', null, null, null, 'Retrato em Storage.'),
  ('patient_clinical_profile', 'RETAIN_WITH_LEGAL_REASON', 'professional_record_retention_pending_review', 5, 5, 'Perfil clínico.'),
  ('clinical_sessions', 'RETAIN_WITH_LEGAL_REASON', 'professional_record_retention_pending_review', 5, 5, 'Sessões clínicas.'),
  ('session_dpep', 'RETAIN_WITH_LEGAL_REASON', 'professional_record_retention_pending_review', 5, 5, 'DPEP.'),
  ('session_clinical_working_notes', 'RETAIN_WITH_LEGAL_REASON', 'professional_record_retention_pending_review', 5, 5, 'Área de trabalho clínico.'),
  ('session_transcript_segments', 'RETAIN_WITH_LEGAL_REASON', 'professional_record_retention_pending_review', 5, 5, 'Transcrição.'),
  ('session_audio_fallback', 'DELETE', null, null, null, 'Áudio bruto de fallback.'),
  ('appointments', 'ANONYMIZE', null, null, null, 'Agenda: summary sem identificadores.'),
  ('consents', 'RETAIN_WITH_LEGAL_REASON', 'consent_evidence_pending_review', 5, 5, 'Prova de consentimento.'),
  ('consent_files', 'RETAIN_WITH_LEGAL_REASON', 'consent_evidence_pending_review', 5, 5, 'PDF de TCLE.'),
  ('documents_issued', 'RETAIN_WITH_LEGAL_REASON', 'professional_record_retention_pending_review', 5, 5, 'Documentos emitidos.'),
  ('documents_draft', 'DELETE', null, null, null, 'Rascunhos não emitidos.'),
  ('patient_attachments', 'DELETE', null, null, null, 'Anexos pessoais.'),
  ('ai_runs_artifacts', 'DELETE', null, null, null, 'Rascunhos de IA.'),
  ('financial_plans', 'RETAIN_WITH_LEGAL_REASON', 'accounting_fiscal_pending_review', 5, 5, 'Planos financeiros.'),
  ('financial_charges_payments', 'RETAIN_WITH_LEGAL_REASON', 'accounting_fiscal_pending_review', 5, 5, 'Cobranças e pagamentos.'),
  ('communication_preferences', 'DELETE', null, null, null, 'Preferências WhatsApp.'),
  ('whatsapp_messages', 'ANONYMIZE', null, null, null, 'Conteúdo e números.'),
  ('whatsapp_outbox', 'DELETE', null, null, null, 'Fila de lembretes.'),
  ('logical_exports', 'DELETE', null, null, null, 'Exportações lógicas do paciente.'),
  ('audit_events', 'RETAIN_WITH_LEGAL_REASON', 'audit_trail_pending_review', null, 5, 'Trilha append-only.'),
  ('document_professional_signatures', 'RETAIN_WITH_LEGAL_REASON', 'professional_record_retention_pending_review', 5, 5, 'Confirmação eletrônica interna. Não é ICP-Brasil.'),
  ('patient_elimination_runs', 'RETAIN_WITH_LEGAL_REASON', 'audit_trail_pending_review', null, 5, 'Metadado da execução do plano.');

alter table public.patient_data_class_policies enable row level security;
create policy patient_data_class_policies_select
  on public.patient_data_class_policies for select to authenticated
  using (true);
grant select on public.patient_data_class_policies to authenticated;

create table public.patient_retention_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  data_class text not null references public.patient_data_class_policies (data_class),
  legal_basis_key text,
  retained_until date,
  review_at date,
  created_at timestamptz not null default now(),
  constraint patient_retention_records_unique unique (patient_id, data_class)
);

alter table public.patient_retention_records enable row level security;
create policy patient_retention_records_admin_select
  on public.patient_retention_records for select to authenticated
  using (public.is_psychologist_admin(organization_id));
grant select on public.patient_retention_records to authenticated;

create table public.patient_elimination_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  status public.patient_elimination_status not null,
  summary jsonb not null default '{}'::jsonb,
  storage_objects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.patient_elimination_runs enable row level security;
create policy patient_elimination_runs_admin_select
  on public.patient_elimination_runs for select to authenticated
  using (public.is_psychologist_admin(organization_id));
grant select on public.patient_elimination_runs to authenticated;

create or replace function public.execute_patient_elimination_plan(p_patient_id uuid)
returns table (
  run_id uuid,
  elimination_status public.patient_elimination_status,
  summary jsonb,
  storage_objects jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  patient_row public.patients%rowtype;
  storage_acc jsonb := '[]'::jsonb;
  deleted text[] := '{}';
  anonymized text[] := '{}';
  retained text[] := '{}';
  errors text[] := '{}';
  rec record;
  path text;
  sess_id uuid;
  has_retain boolean := false;
  final_status public.patient_elimination_status;
  new_run uuid;
  v_public_code text;
  retain_until date;
  review_at date;
begin
  if auth.uid() is null then
    raise exception 'execute_patient_elimination_plan requires authentication'
      using errcode = '42501';
  end if;

  select * into patient_row from public.patients where id = p_patient_id;
  if patient_row.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if not public.is_psychologist_admin(patient_row.organization_id) then
    raise exception 'only psychologist_admin may execute the elimination plan'
      using errcode = '42501';
  end if;

  v_public_code := patient_row.public_code;

  -- Collect storage paths before mutating rows.
  if patient_row.photo_path is not null then
    storage_acc := storage_acc || jsonb_build_array(jsonb_build_object(
      'bucket', 'patient-attachments', 'path', patient_row.photo_path
    ));
  end if;

  for rec in
    select storage_path from public.patient_attachments where patient_id = p_patient_id
  loop
    storage_acc := storage_acc || jsonb_build_array(jsonb_build_object(
      'bucket', 'patient-attachments', 'path', rec.storage_path
    ));
  end loop;

  for rec in
    select df.storage_path
    from public.document_files df
    join public.documents d on d.id = df.document_id
    where d.patient_id = p_patient_id and d.status = 'draft'
  loop
    storage_acc := storage_acc || jsonb_build_array(jsonb_build_object(
      'bucket', 'clinical-documents', 'path', rec.storage_path
    ));
  end loop;

  for rec in
    select le.storage_path
    from public.logical_exports le
    where le.patient_id = p_patient_id and le.storage_path is not null
  loop
    storage_acc := storage_acc || jsonb_build_array(jsonb_build_object(
      'bucket', 'tesseli-exports', 'path', rec.storage_path
    ));
  end loop;

  for sess_id in
    select id from public.clinical_sessions where patient_id = p_patient_id
  loop
    for rec in
      select storage_path from public.session_transcript_artifacts
      where session_id = sess_id and storage_path is not null
    loop
      storage_acc := storage_acc || jsonb_build_array(jsonb_build_object(
        'bucket', 'session-audio-fallback', 'path', rec.storage_path
      ));
    end loop;

    begin
      for rec in
        select name from storage.objects
        where bucket_id = 'session-audio-fallback'
          and name like patient_row.organization_id::text || '/' || sess_id::text || '/%'
      loop
        storage_acc := storage_acc || jsonb_build_array(jsonb_build_object(
          'bucket', 'session-audio-fallback', 'path', rec.name
        ));
      end loop;
    exception when others then
      errors := array_append(errors, 'session_audio_fallback_list');
    end;
  end loop;

  -- ANONYMIZE identifiers
  update public.patients
  set
    preferred_name = 'Eliminado ' || v_public_code,
    full_name = 'Paciente eliminado (' || v_public_code || ')',
    email = null,
    phone = null,
    cpf = null,
    birth_date = null,
    responsibles = '[]'::jsonb,
    status = 'archived',
    photo_path = null,
    elimination_status = 'elimination_requested',
    elimination_requested_at = coalesce(elimination_requested_at, now())
  where id = p_patient_id;
  anonymized := array_append(anonymized, 'patient_identifiers');
  deleted := array_append(deleted, 'patient_photo');

  update public.appointments
  set summary_snapshot = v_public_code
  where patient_id = p_patient_id
    and summary_snapshot is not null
    and summary_snapshot is distinct from v_public_code;
  anonymized := array_append(anonymized, 'appointments');

  update public.whatsapp_messages
  set to_number = 'anonymized',
      body_redacted = null
  where patient_id = p_patient_id;
  update public.whatsapp_inbound_messages
  set from_number = 'anonymized',
      body_redacted = null
  where patient_id = p_patient_id;
  anonymized := array_append(anonymized, 'whatsapp_messages');

  -- DELETE classes
  delete from public.patient_attachments where patient_id = p_patient_id;
  deleted := array_append(deleted, 'patient_attachments');

  delete from public.documents
  where patient_id = p_patient_id and status = 'draft';
  deleted := array_append(deleted, 'documents_draft');

  delete from public.ai_runs where patient_id = p_patient_id;
  deleted := array_append(deleted, 'ai_runs_artifacts');

  delete from public.communication_preferences where patient_id = p_patient_id;
  deleted := array_append(deleted, 'communication_preferences');

  delete from public.whatsapp_reminder_outbox where patient_id = p_patient_id;
  deleted := array_append(deleted, 'whatsapp_outbox');

  delete from public.logical_exports where patient_id = p_patient_id;
  deleted := array_append(deleted, 'logical_exports');

  update public.session_transcript_artifacts a
  set storage_path = null
  from public.clinical_sessions cs
  where a.session_id = cs.id and cs.patient_id = p_patient_id;
  deleted := array_append(deleted, 'session_audio_fallback');

  -- RETAIN classes: record policy, never invent a legal opinion.
  for rec in
    select data_class, legal_basis_key, retention_years, review_years
    from public.patient_data_class_policies
    where policy = 'RETAIN_WITH_LEGAL_REASON'
  loop
    retain_until := case
      when rec.retention_years is null then null
      else (current_date + make_interval(years => rec.retention_years))::date
    end;
    review_at := case
      when rec.review_years is null then null
      else (current_date + make_interval(years => rec.review_years))::date
    end;

    if rec.data_class = 'patient_clinical_profile'
       and exists (select 1 from public.patient_clinical_profile where patient_id = p_patient_id) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'clinical_sessions'
       and exists (select 1 from public.clinical_sessions where patient_id = p_patient_id) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'session_dpep'
       and exists (
         select 1 from public.session_dpep d
         join public.clinical_sessions cs on cs.id = d.session_id
         where cs.patient_id = p_patient_id
       ) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'session_clinical_working_notes'
       and exists (
         select 1 from public.session_clinical_working_notes n
         join public.clinical_sessions cs on cs.id = n.session_id
         where cs.patient_id = p_patient_id
       ) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'session_transcript_segments'
       and exists (
         select 1 from public.session_transcript_segments s
         join public.clinical_sessions cs on cs.id = s.session_id
         where cs.patient_id = p_patient_id
       ) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'consents'
       and exists (select 1 from public.consents where patient_id = p_patient_id) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'consent_files'
       and exists (
         select 1 from public.consent_files f
         join public.consents c on c.id = f.consent_id
         where c.patient_id = p_patient_id
       ) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'documents_issued'
       and exists (
         select 1 from public.documents
         where patient_id = p_patient_id and status <> 'draft'
       ) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'financial_plans'
       and exists (select 1 from public.financial_plans where patient_id = p_patient_id) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'financial_charges_payments'
       and exists (select 1 from public.financial_charges where patient_id = p_patient_id) then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    elsif rec.data_class = 'audit_events' then
      has_retain := true;
      retained := array_append(retained, rec.data_class);
    else
      continue;
    end if;

    insert into public.patient_retention_records (
      organization_id, patient_id, data_class, legal_basis_key, retained_until, review_at
    ) values (
      patient_row.organization_id, p_patient_id, rec.data_class,
      rec.legal_basis_key, retain_until, review_at
    )
    on conflict (patient_id, data_class) do nothing;
  end loop;

  -- audit_events is always a retained trail and must not, by itself, block
  -- 'eliminated' when every DELETE/ANONYMIZE class has been processed.
  final_status := case
    when exists (
      select 1 from unnest(retained) as x(data_class)
      where x.data_class is distinct from 'audit_events'
    ) then 'partially_eliminated'::public.patient_elimination_status
    else 'eliminated'::public.patient_elimination_status
  end;

  update public.patients
  set
    elimination_status = final_status,
    elimination_completed_at = now(),
    elimination_retained_reason = case
      when final_status = 'partially_eliminated' then
        'Dados retidos conforme patient_data_class_policies (fundamento configurável, revisão jurídica pendente).'
      else null
    end
  where id = p_patient_id;

  insert into public.patient_elimination_runs (
    organization_id, patient_id, actor_user_id, status, summary, storage_objects
  ) values (
    patient_row.organization_id,
    p_patient_id,
    auth.uid(),
    final_status,
    jsonb_build_object(
      'deleted', to_jsonb(deleted),
      'anonymized', to_jsonb(anonymized),
      'retained', to_jsonb(retained),
      'errors', to_jsonb(errors)
    ),
    storage_acc
  )
  returning id into new_run;

  perform public.log_audit_event(
    patient_row.organization_id,
    'settings.lgpd.eliminate',
    'patient',
    v_public_code,
    jsonb_build_object('outcome', final_status::text, 'run_id', new_run::text)
  );

  -- Best-effort metadata cleanup; physical Storage deletion is completed by
  -- the application using the returned storage_objects list.
  for rec in select * from jsonb_to_recordset(storage_acc) as x(bucket text, path text)
  loop
    begin
      delete from storage.objects
      where bucket_id = rec.bucket and name = rec.path;
    exception when others then
      null;
    end;
  end loop;

  run_id := new_run;
  elimination_status := final_status;
  summary := jsonb_build_object(
    'deleted', to_jsonb(deleted),
    'anonymized', to_jsonb(anonymized),
    'retained', to_jsonb(retained),
    'errors', to_jsonb(errors)
  );
  storage_objects := storage_acc;
  return next;
end;
$$;

revoke all on function public.execute_patient_elimination_plan(uuid) from public;
grant execute on function public.execute_patient_elimination_plan(uuid) to authenticated;

create or replace function public.verify_patient_elimination(p_patient_id uuid)
returns table (
  status text,
  remaining_data_classes text[],
  retained_data_classes text[],
  errors text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  patient_row public.patients%rowtype;
  remaining text[] := '{}';
  retained text[] := '{}';
  err text[] := '{}';
  result_status text;
begin
  if auth.uid() is null then
    raise exception 'verify_patient_elimination requires authentication'
      using errcode = '42501';
  end if;

  select * into patient_row from public.patients where id = p_patient_id;
  if patient_row.id is null then
    raise exception 'patient not found' using errcode = 'P0002';
  end if;

  if not public.is_psychologist_admin(patient_row.organization_id) then
    raise exception 'only psychologist_admin may verify elimination'
      using errcode = '42501';
  end if;

  if patient_row.email is not null
     or patient_row.phone is not null
     or patient_row.cpf is not null
     or patient_row.birth_date is not null
     or coalesce(jsonb_array_length(patient_row.responsibles), 0) > 0
     or patient_row.preferred_name not like 'Eliminado %'
     or patient_row.full_name not like 'Paciente eliminado (%' then
    remaining := array_append(remaining, 'patient_identifiers');
  end if;

  if patient_row.photo_path is not null then
    remaining := array_append(remaining, 'patient_photo');
  end if;

  if exists (select 1 from public.patient_attachments where patient_id = p_patient_id) then
    remaining := array_append(remaining, 'patient_attachments');
  end if;

  if exists (select 1 from public.documents where patient_id = p_patient_id and status = 'draft') then
    remaining := array_append(remaining, 'documents_draft');
  end if;

  if exists (select 1 from public.ai_runs where patient_id = p_patient_id) then
    remaining := array_append(remaining, 'ai_runs_artifacts');
  end if;

  if exists (select 1 from public.communication_preferences where patient_id = p_patient_id) then
    remaining := array_append(remaining, 'communication_preferences');
  end if;

  if exists (select 1 from public.whatsapp_reminder_outbox where patient_id = p_patient_id) then
    remaining := array_append(remaining, 'whatsapp_outbox');
  end if;

  if exists (select 1 from public.logical_exports where patient_id = p_patient_id) then
    remaining := array_append(remaining, 'logical_exports');
  end if;

  if exists (
    select 1 from public.whatsapp_messages
    where patient_id = p_patient_id and to_number is distinct from 'anonymized'
  ) or exists (
    select 1 from public.whatsapp_inbound_messages
    where patient_id = p_patient_id and from_number is distinct from 'anonymized'
  ) then
    remaining := array_append(remaining, 'whatsapp_messages');
  end if;

  if exists (
    select 1 from public.appointments
    where patient_id = p_patient_id
      and summary_snapshot is not null
      and summary_snapshot not in (patient_row.public_code)
      and summary_snapshot like '% %'
  ) then
    remaining := array_append(remaining, 'appointments');
  end if;

  if exists (select 1 from public.patient_clinical_profile where patient_id = p_patient_id) then
    retained := array_append(retained, 'patient_clinical_profile');
  end if;
  if exists (select 1 from public.clinical_sessions where patient_id = p_patient_id) then
    retained := array_append(retained, 'clinical_sessions');
  end if;
  if exists (
    select 1 from public.session_dpep d
    join public.clinical_sessions cs on cs.id = d.session_id
    where cs.patient_id = p_patient_id
  ) then
    retained := array_append(retained, 'session_dpep');
  end if;
  if exists (
    select 1 from public.session_transcript_segments s
    join public.clinical_sessions cs on cs.id = s.session_id
    where cs.patient_id = p_patient_id
  ) then
    retained := array_append(retained, 'session_transcript_segments');
  end if;
  if exists (
    select 1 from public.session_clinical_working_notes n
    join public.clinical_sessions cs on cs.id = n.session_id
    where cs.patient_id = p_patient_id
  ) then
    retained := array_append(retained, 'session_clinical_working_notes');
  end if;
  if exists (
    select 1 from public.session_transcript_artifacts a
    join public.clinical_sessions cs on cs.id = a.session_id
    where cs.patient_id = p_patient_id and a.storage_path is not null
  ) then
    remaining := array_append(remaining, 'session_audio_fallback');
  end if;
  if exists (select 1 from public.consents where patient_id = p_patient_id) then
    retained := array_append(retained, 'consents');
  end if;
  if exists (
    select 1 from public.consent_files f
    join public.consents c on c.id = f.consent_id
    where c.patient_id = p_patient_id
  ) then
    retained := array_append(retained, 'consent_files');
  end if;
  if exists (
    select 1 from public.documents where patient_id = p_patient_id and status <> 'draft'
  ) then
    retained := array_append(retained, 'documents_issued');
  end if;
  if exists (select 1 from public.financial_plans where patient_id = p_patient_id)
     or exists (select 1 from public.financial_charges where patient_id = p_patient_id) then
    retained := array_append(retained, 'financial_charges_payments');
  end if;
  retained := array_append(retained, 'audit_events');

  if array_length(err, 1) is not null then
    result_status := 'failed';
  elsif array_length(remaining, 1) is not null then
    result_status := 'partially_eliminated';
  elsif array_length(retained, 1) is not null
        and retained <> array['audit_events']::text[] then
    result_status := 'retained_by_policy';
  else
    result_status := 'eliminated';
  end if;

  status := result_status;
  remaining_data_classes := remaining;
  retained_data_classes := retained;
  errors := err;
  return next;
end;
$$;

revoke all on function public.verify_patient_elimination(uuid) from public;
grant execute on function public.verify_patient_elimination(uuid) to authenticated;
