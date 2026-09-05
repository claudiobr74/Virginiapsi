-- Phase 5: low-risk database performance improvements on verified hot paths.
-- No authorization semantics are changed; RLS predicates are preserved and
-- auth.uid() is wrapped in SELECT so Postgres can treat it as an initplan.

-- Foreign-key / tenant lookup coverage for hot clinical, transcription,
-- knowledge and finance paths. Use IF NOT EXISTS to keep the migration safe
-- against hosted/schema drift.
create index if not exists patients_responsible_psychologist_user_idx
  on public.patients (responsible_psychologist_user_id)
  where responsible_psychologist_user_id is not null;

create index if not exists clinical_sessions_patient_fk_idx
  on public.clinical_sessions (patient_id);

create index if not exists clinical_sessions_therapist_user_idx
  on public.clinical_sessions (therapist_user_id);

create index if not exists session_meet_bindings_organization_idx
  on public.session_meet_bindings (organization_id);

create index if not exists session_meet_transcript_entries_organization_idx
  on public.session_meet_transcript_entries (organization_id);

create index if not exists session_transcript_artifacts_session_idx
  on public.session_transcript_artifacts (session_id);

create index if not exists session_transcript_artifacts_organization_idx
  on public.session_transcript_artifacts (organization_id);

create index if not exists session_transcript_segments_organization_idx
  on public.session_transcript_segments (organization_id);

create index if not exists knowledge_chunks_organization_idx
  on public.knowledge_chunks (organization_id);

create index if not exists knowledge_embeddings_organization_idx
  on public.knowledge_embeddings (organization_id);

create index if not exists financial_charges_plan_idx
  on public.financial_charges (plan_id)
  where plan_id is not null;

create index if not exists financial_plans_organization_idx
  on public.financial_plans (organization_id);

-- RLS initplan optimization. Authorization logic is intentionally identical
-- to the prior policies; only auth.uid() becomes (select auth.uid()).

drop policy if exists organization_members_select_self_or_admin
  on public.organization_members;
create policy organization_members_select_self_or_admin
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_psychologist_admin(organization_id)
  );

drop policy if exists logical_exports_insert_admin
  on public.logical_exports;
create policy logical_exports_insert_admin
  on public.logical_exports
  for insert
  to authenticated
  with check (
    public.is_psychologist_admin(organization_id)
    and actor_user_id = (select auth.uid())
  );

drop policy if exists platform_operators_select_self
  on public.platform_operators;
create policy platform_operators_select_self
  on public.platform_operators
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_platform_operator()
  );

drop policy if exists patients_select_members
  on public.patients;
create policy patients_select_members
  on public.patients
  for select
  to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.can_manage_org_patients(organization_id)
      or (
        public.is_clinical_practitioner(organization_id)
        and responsible_psychologist_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists patients_insert_members
  on public.patients;
create policy patients_insert_members
  on public.patients
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and (
      public.can_manage_org_patients(organization_id)
      or (
        public.is_clinical_practitioner(organization_id)
        and (
          responsible_psychologist_user_id is null
          or responsible_psychologist_user_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists patients_update_members
  on public.patients;
create policy patients_update_members
  on public.patients
  for update
  to authenticated
  using (
    public.is_org_member(organization_id)
    and (
      public.can_manage_org_patients(organization_id)
      or (
        public.is_clinical_practitioner(organization_id)
        and responsible_psychologist_user_id = (select auth.uid())
      )
    )
  )
  with check (
    public.is_org_member(organization_id)
    and (
      public.can_manage_org_patients(organization_id)
      or (
        public.is_clinical_practitioner(organization_id)
        and responsible_psychologist_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists document_template_favorites_select
  on public.document_template_favorites;
create policy document_template_favorites_select
  on public.document_template_favorites
  for select
  to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

drop policy if exists document_template_favorites_insert
  on public.document_template_favorites;
create policy document_template_favorites_insert
  on public.document_template_favorites
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

drop policy if exists document_template_favorites_delete
  on public.document_template_favorites;
create policy document_template_favorites_delete
  on public.document_template_favorites
  for delete
  to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );
