-- G2 identity: platform operators (D5b), pending invitations (D1 B),
-- psychologist role, and D4b clinical isolation by responsible psychologist.
-- Specs: docs/26-go-live.md, docs/05-security-rbac-rls.md.
--
-- The clinic administrator (psychologist_admin) keeps administrative cadastro
-- of every patient in the organization, but clinical rows are visible only
-- when patients.responsible_psychologist_user_id = auth.uid(). Knowledge is
-- the clinic library (clinical practitioners), not a patient chart.

-- ---------------------------------------------------------------------------
-- Platform operators (D5b)
-- ---------------------------------------------------------------------------

create table public.platform_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

comment on table public.platform_operators is
  'Allowlist of people who may create organizations. Not a clinic role.';

alter table public.platform_operators enable row level security;

grant select on public.platform_operators to authenticated;

create or replace function public.is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_operators o
    where o.user_id = auth.uid()
  );
$$;

create policy platform_operators_select_self
  on public.platform_operators
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_operator());

create or replace function public.claim_platform_operator()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'platform operator claim requires an authenticated user'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.platform_operators) then
    return public.is_platform_operator();
  end if;

  insert into public.platform_operators (user_id, created_by)
  values (actor, actor);

  return true;
end;
$$;

create or replace function public.add_platform_operator(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user id required' using errcode = '22023';
  end if;

  insert into public.platform_operators (user_id, created_by)
  values (p_user_id, auth.uid())
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.platform_bootstrap_state()
returns table (is_operator boolean, operators_exist boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_operator(),
    exists (select 1 from public.platform_operators);
$$;

revoke all on function public.is_platform_operator() from public;
revoke all on function public.claim_platform_operator() from public;
revoke all on function public.add_platform_operator(uuid) from public;
revoke all on function public.platform_bootstrap_state() from public;

grant execute on function public.is_platform_operator() to authenticated;
grant execute on function public.claim_platform_operator() to authenticated;
grant execute on function public.add_platform_operator(uuid) to authenticated;
grant execute on function public.platform_bootstrap_state() to authenticated;

create or replace function public.bootstrap_organization(
  org_name text,
  org_slug text,
  professional_name text default null,
  org_timezone text default 'America/Sao_Paulo'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'organization bootstrap requires an authenticated user'
      using errcode = '42501';
  end if;

  if not public.is_platform_operator() then
    raise exception 'organization bootstrap requires a platform operator'
      using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, timezone)
  values (btrim(org_name), lower(btrim(org_slug)), coalesce(nullif(btrim(org_timezone), ''), 'America/Sao_Paulo'))
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (new_org_id, actor, 'psychologist_admin', true);

  insert into public.practice_settings (organization_id, professional_name)
  values (new_org_id, nullif(btrim(coalesce(professional_name, '')), ''));

  insert into public.audit_events (
    organization_id, actor_user_id, action, resource_type, resource_id
  )
  values (
    new_org_id, actor, 'organization.bootstrap', 'organization',
    new_org_id::text
  );

  return new_org_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clinical / cadastro helpers (D4b)
-- ---------------------------------------------------------------------------

create or replace function public.is_clinical_practitioner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_org_role(org_id, array['psychologist_admin', 'psychologist']);
$$;

create or replace function public.can_manage_org_patients(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_org_role(org_id, array['psychologist_admin', 'secretary']);
$$;

create or replace function public.can_access_patient_record(org_id uuid, p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_org_member(org_id)
    and (
      public.can_manage_org_patients(org_id)
      or (
        p_patient_id is not null
        and exists (
          select 1
          from public.patients p
          where p.id = p_patient_id
            and p.organization_id = org_id
            and p.responsible_psychologist_user_id = auth.uid()
        )
      )
    );
$$;

create or replace function public.can_access_patient_clinical(org_id uuid, p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and p.organization_id = org_id
      and p.responsible_psychologist_user_id = auth.uid()
      and public.is_clinical_practitioner(org_id)
  );
$$;

create or replace function public.can_access_clinical_session(org_id uuid, p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinical_sessions cs
    where cs.id = p_session_id
      and cs.organization_id = org_id
      and public.can_access_patient_clinical(cs.organization_id, cs.patient_id)
  );
$$;

create or replace function public.can_access_document(
  org_id uuid,
  p_patient_id uuid,
  p_sensitivity public.document_sensitivity
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_sensitivity = 'administrative' then
      public.can_access_patient_record(org_id, p_patient_id)
    when p_patient_id is null then
      public.is_clinical_practitioner(org_id)
    else
      public.can_access_patient_clinical(org_id, p_patient_id)
  end;
$$;

revoke all on function public.is_clinical_practitioner(uuid) from public;
revoke all on function public.can_manage_org_patients(uuid) from public;
revoke all on function public.can_access_patient_record(uuid, uuid) from public;
revoke all on function public.can_access_patient_clinical(uuid, uuid) from public;
revoke all on function public.can_access_clinical_session(uuid, uuid) from public;
revoke all on function public.can_access_document(uuid, uuid, public.document_sensitivity) from public;

grant execute on function public.is_clinical_practitioner(uuid) to authenticated;
grant execute on function public.can_manage_org_patients(uuid) to authenticated;
grant execute on function public.can_access_patient_record(uuid, uuid) to authenticated;
grant execute on function public.can_access_patient_clinical(uuid, uuid) to authenticated;
grant execute on function public.can_access_clinical_session(uuid, uuid) to authenticated;
grant execute on function public.can_access_document(uuid, uuid, public.document_sensitivity) to authenticated;

-- Psychologist is not covered by secretary_finance_access of the clinic.
create or replace function public.secretary_finance_access(org_id uuid)
returns public.secretary_finance_access
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.is_org_member(org_id) then null
    when public.is_psychologist_admin(org_id) then 'manage'::public.secretary_finance_access
    when public.has_org_role(org_id, array['secretary']) then coalesce(
      (
        select s.secretary_finance_access
        from public.practice_settings s
        where s.organization_id = org_id
      ),
      'none'::public.secretary_finance_access
    )
    else 'none'::public.secretary_finance_access
  end;
$$;

-- ---------------------------------------------------------------------------
-- Responsible psychologist: clinical practitioner, auto-assign, admin reassign
-- ---------------------------------------------------------------------------

create or replace function public.assert_valid_responsible_psychologist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and new.responsible_psychologist_user_id is null
     and public.is_clinical_practitioner(new.organization_id) then
    new.responsible_psychologist_user_id := auth.uid();
  end if;

  if tg_op = 'UPDATE'
     and new.responsible_psychologist_user_id is distinct from old.responsible_psychologist_user_id
     and not public.is_psychologist_admin(new.organization_id) then
    raise exception 'only psychologist_admin may reassign the responsible psychologist'
      using errcode = '42501';
  end if;

  if new.responsible_psychologist_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.responsible_psychologist_user_id
      and m.role in ('psychologist_admin', 'psychologist')
      and m.active
  ) then
    raise exception 'responsible_psychologist_user_id must be an active clinical practitioner of the same organization'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.list_assignable_psychologists(p_org_id uuid)
returns table (
  user_id uuid,
  role public.organization_role,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    m.user_id,
    m.role,
    u.email
  from public.organization_members m
  left join auth.users u on u.id = m.user_id
  where m.organization_id = p_org_id
    and m.active
    and m.role in ('psychologist_admin', 'psychologist')
  order by m.created_at;
end;
$$;

revoke all on function public.list_assignable_psychologists(uuid) from public;
grant execute on function public.list_assignable_psychologists(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pending invitations (D1 B)
-- ---------------------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.organization_role not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, lower(email))
  where status = 'pending';

alter table public.organization_invitations enable row level security;

grant select, insert, update on public.organization_invitations to authenticated;

create policy organization_invitations_select_admin
  on public.organization_invitations
  for select
  to authenticated
  using (public.is_psychologist_admin(organization_id));

create policy organization_invitations_insert_admin
  on public.organization_invitations
  for insert
  to authenticated
  with check (public.is_psychologist_admin(organization_id));

create policy organization_invitations_update_admin
  on public.organization_invitations
  for update
  to authenticated
  using (public.is_psychologist_admin(organization_id))
  with check (public.is_psychologist_admin(organization_id));

create or replace function public.invite_organization_member(
  p_org_id uuid,
  p_email text,
  p_role public.organization_role
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  membership_id uuid;
  invitation_id uuid;
  normalized_email text;
begin
  if not public.is_psychologist_admin(p_org_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_role not in ('psychologist_admin', 'psychologist', 'secretary') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  if p_email is null or btrim(p_email) = '' or position('@' in p_email) = 0 then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  normalized_email := lower(btrim(p_email));

  select u.id into target_user
  from auth.users u
  where lower(u.email) = normalized_email;

  if target_user is not null then
    insert into public.organization_members (organization_id, user_id, role, active)
    values (p_org_id, target_user, p_role, true)
    on conflict (organization_id, user_id) do update
      set role = excluded.role,
          active = true
    returning id into membership_id;

    update public.organization_invitations
    set status = 'accepted',
        accepted_at = now()
    where organization_id = p_org_id
      and lower(email) = normalized_email
      and status = 'pending';

    return membership_id;
  end if;

  select i.id into invitation_id
  from public.organization_invitations i
  where i.organization_id = p_org_id
    and lower(i.email) = normalized_email
    and i.status = 'pending';

  if invitation_id is not null then
    update public.organization_invitations
    set role = p_role,
        invited_by = auth.uid(),
        expires_at = now() + interval '14 days'
    where id = invitation_id;
    return invitation_id;
  end if;

  insert into public.organization_invitations (
    organization_id, email, role, invited_by
  )
  values (p_org_id, normalized_email, p_role, auth.uid())
  returning id into invitation_id;

  return invitation_id;
end;
$$;

create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  accepted integer := 0;
  invitation record;
begin
  if actor is null then
    raise exception 'accept invitations requires an authenticated user'
      using errcode = '42501';
  end if;

  select lower(u.email) into actor_email
  from auth.users u
  where u.id = actor;

  if actor_email is null then
    return 0;
  end if;

  for invitation in
    select i.id, i.organization_id, i.role
    from public.organization_invitations i
    where i.status = 'pending'
      and lower(i.email) = actor_email
      and i.expires_at > now()
  loop
    insert into public.organization_members (
      organization_id, user_id, role, active
    )
    values (invitation.organization_id, actor, invitation.role, true)
    on conflict (organization_id, user_id) do update
      set role = excluded.role,
          active = true;

    update public.organization_invitations
    set status = 'accepted',
        accepted_at = now()
    where id = invitation.id;

    accepted := accepted + 1;
  end loop;

  update public.organization_invitations
  set status = 'expired'
  where status = 'pending'
    and lower(email) = actor_email
    and expires_at <= now();

  return accepted;
end;
$$;

revoke all on function public.invite_organization_member(uuid, text, public.organization_role) from public;
revoke all on function public.accept_pending_invitations() from public;
grant execute on function public.invite_organization_member(uuid, text, public.organization_role) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;

-- ---------------------------------------------------------------------------
-- patients RLS (cadastro: admin/secretary all; psychologist own)
-- ---------------------------------------------------------------------------

drop policy if exists patients_select_members on public.patients;
drop policy if exists patients_insert_members on public.patients;
drop policy if exists patients_update_members on public.patients;

create policy patients_select_members
  on public.patients
  for select
  to authenticated
  using (public.can_access_patient_record(organization_id, id));

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
          or responsible_psychologist_user_id = auth.uid()
        )
      )
    )
  );

create policy patients_update_members
  on public.patients
  for update
  to authenticated
  using (public.can_access_patient_record(organization_id, id))
  with check (public.can_access_patient_record(organization_id, id));

drop policy if exists patient_clinical_profile_all_admin on public.patient_clinical_profile;

create policy patient_clinical_profile_responsible
  on public.patient_clinical_profile
  for all
  to authenticated
  using (public.can_access_patient_clinical(organization_id, patient_id))
  with check (public.can_access_patient_clinical(organization_id, patient_id));

-- ---------------------------------------------------------------------------
-- appointments: psychologist only sees own patients
-- ---------------------------------------------------------------------------

drop policy if exists appointments_select_members on public.appointments;
drop policy if exists appointments_insert_managed on public.appointments;
drop policy if exists appointments_update_managed on public.appointments;
drop policy if exists appointments_delete_managed on public.appointments;

create policy appointments_select_members
  on public.appointments
  for select
  to authenticated
  using (public.can_access_patient_record(organization_id, patient_id));

create policy appointments_insert_managed
  on public.appointments
  for insert
  to authenticated
  with check (
    public.can_access_patient_record(organization_id, patient_id)
    and origin = 'TESSELI'
  );

create policy appointments_update_managed
  on public.appointments
  for update
  to authenticated
  using (
    public.can_access_patient_record(organization_id, patient_id)
    and origin = 'TESSELI'
  )
  with check (
    public.can_access_patient_record(organization_id, patient_id)
    and origin = 'TESSELI'
  );

create policy appointments_delete_managed
  on public.appointments
  for delete
  to authenticated
  using (
    public.can_access_patient_record(organization_id, patient_id)
    and origin = 'TESSELI'
  );

-- ---------------------------------------------------------------------------
-- Clinical session family
-- ---------------------------------------------------------------------------

drop policy if exists clinical_sessions_admin_select on public.clinical_sessions;
drop policy if exists clinical_sessions_admin_insert on public.clinical_sessions;
drop policy if exists clinical_sessions_admin_update on public.clinical_sessions;

create policy clinical_sessions_responsible_select
  on public.clinical_sessions for select to authenticated
  using (public.can_access_patient_clinical(organization_id, patient_id));
create policy clinical_sessions_responsible_insert
  on public.clinical_sessions for insert to authenticated
  with check (public.can_access_patient_clinical(organization_id, patient_id));
create policy clinical_sessions_responsible_update
  on public.clinical_sessions for update to authenticated
  using (public.can_access_patient_clinical(organization_id, patient_id))
  with check (public.can_access_patient_clinical(organization_id, patient_id));

drop policy if exists session_dpep_admin_select on public.session_dpep;
drop policy if exists session_dpep_admin_insert on public.session_dpep;
drop policy if exists session_dpep_admin_update on public.session_dpep;

create policy session_dpep_responsible_select
  on public.session_dpep for select to authenticated
  using (public.can_access_clinical_session(organization_id, session_id));
create policy session_dpep_responsible_insert
  on public.session_dpep for insert to authenticated
  with check (public.can_access_clinical_session(organization_id, session_id));
create policy session_dpep_responsible_update
  on public.session_dpep for update to authenticated
  using (public.can_access_clinical_session(organization_id, session_id))
  with check (public.can_access_clinical_session(organization_id, session_id));

drop policy if exists session_working_notes_admin_select on public.session_clinical_working_notes;
drop policy if exists session_working_notes_admin_insert on public.session_clinical_working_notes;
drop policy if exists session_working_notes_admin_update on public.session_clinical_working_notes;

create policy session_working_notes_responsible_select
  on public.session_clinical_working_notes for select to authenticated
  using (public.can_access_clinical_session(organization_id, session_id));
create policy session_working_notes_responsible_insert
  on public.session_clinical_working_notes for insert to authenticated
  with check (public.can_access_clinical_session(organization_id, session_id));
create policy session_working_notes_responsible_update
  on public.session_clinical_working_notes for update to authenticated
  using (public.can_access_clinical_session(organization_id, session_id))
  with check (public.can_access_clinical_session(organization_id, session_id));

drop policy if exists transcript_segments_admin_select on public.session_transcript_segments;
drop policy if exists transcript_segments_admin_insert on public.session_transcript_segments;

create policy transcript_segments_responsible_select
  on public.session_transcript_segments for select to authenticated
  using (public.can_access_clinical_session(organization_id, session_id));
create policy transcript_segments_responsible_insert
  on public.session_transcript_segments for insert to authenticated
  with check (public.can_access_clinical_session(organization_id, session_id));

drop policy if exists transcript_artifacts_admin_select on public.session_transcript_artifacts;
drop policy if exists transcript_artifacts_admin_insert on public.session_transcript_artifacts;

create policy transcript_artifacts_responsible_select
  on public.session_transcript_artifacts for select to authenticated
  using (public.can_access_clinical_session(organization_id, session_id));
create policy transcript_artifacts_responsible_insert
  on public.session_transcript_artifacts for insert to authenticated
  with check (public.can_access_clinical_session(organization_id, session_id));

drop policy if exists ai_runs_admin_select on public.ai_runs;
drop policy if exists ai_runs_admin_insert on public.ai_runs;
drop policy if exists ai_runs_admin_update on public.ai_runs;

create policy ai_runs_clinical_select
  on public.ai_runs for select to authenticated
  using (
    case
      when patient_id is not null then
        public.can_access_patient_clinical(organization_id, patient_id)
      else
        public.is_clinical_practitioner(organization_id)
    end
  );
create policy ai_runs_clinical_insert
  on public.ai_runs for insert to authenticated
  with check (
    case
      when patient_id is not null then
        public.can_access_patient_clinical(organization_id, patient_id)
      else
        public.is_clinical_practitioner(organization_id)
    end
  );
create policy ai_runs_clinical_update
  on public.ai_runs for update to authenticated
  using (
    case
      when patient_id is not null then
        public.can_access_patient_clinical(organization_id, patient_id)
      else
        public.is_clinical_practitioner(organization_id)
    end
  )
  with check (
    case
      when patient_id is not null then
        public.can_access_patient_clinical(organization_id, patient_id)
      else
        public.is_clinical_practitioner(organization_id)
    end
  );

drop policy if exists ai_artifacts_admin_select on public.ai_artifacts;
drop policy if exists ai_artifacts_admin_insert on public.ai_artifacts;
drop policy if exists ai_artifacts_admin_update on public.ai_artifacts;

create policy ai_artifacts_clinical_select
  on public.ai_artifacts for select to authenticated
  using (
    exists (
      select 1 from public.ai_runs r
      where r.id = ai_artifacts.run_id
        and r.organization_id = ai_artifacts.organization_id
        and case
          when r.patient_id is not null then
            public.can_access_patient_clinical(r.organization_id, r.patient_id)
          else
            public.is_clinical_practitioner(r.organization_id)
        end
    )
  );
create policy ai_artifacts_clinical_insert
  on public.ai_artifacts for insert to authenticated
  with check (
    exists (
      select 1 from public.ai_runs r
      where r.id = ai_artifacts.run_id
        and r.organization_id = ai_artifacts.organization_id
        and case
          when r.patient_id is not null then
            public.can_access_patient_clinical(r.organization_id, r.patient_id)
          else
            public.is_clinical_practitioner(r.organization_id)
        end
    )
  );
create policy ai_artifacts_clinical_update
  on public.ai_artifacts for update to authenticated
  using (
    exists (
      select 1 from public.ai_runs r
      where r.id = ai_artifacts.run_id
        and r.organization_id = ai_artifacts.organization_id
        and case
          when r.patient_id is not null then
            public.can_access_patient_clinical(r.organization_id, r.patient_id)
          else
            public.is_clinical_practitioner(r.organization_id)
        end
    )
  )
  with check (
    exists (
      select 1 from public.ai_runs r
      where r.id = ai_artifacts.run_id
        and r.organization_id = ai_artifacts.organization_id
        and case
          when r.patient_id is not null then
            public.can_access_patient_clinical(r.organization_id, r.patient_id)
          else
            public.is_clinical_practitioner(r.organization_id)
        end
    )
  );

-- ---------------------------------------------------------------------------
-- Consents
-- ---------------------------------------------------------------------------

drop policy if exists consents_select_admin_or_administrative on public.consents;
drop policy if exists consents_insert_admin on public.consents;
drop policy if exists consents_update_admin on public.consents;

create policy consents_select_admin_or_administrative
  on public.consents
  for select
  to authenticated
  using (
    (
      public.consent_type_is_administrative(type)
      and public.is_org_member(organization_id)
    )
    or public.can_access_patient_clinical(organization_id, patient_id)
  );

create policy consents_insert_clinical
  on public.consents
  for insert
  to authenticated
  with check (
    (
      public.consent_type_is_administrative(type)
      and public.is_org_member(organization_id)
    )
    or public.can_access_patient_clinical(organization_id, patient_id)
  );

create policy consents_update_clinical
  on public.consents
  for update
  to authenticated
  using (
    (
      public.consent_type_is_administrative(type)
      and public.is_org_member(organization_id)
    )
    or public.can_access_patient_clinical(organization_id, patient_id)
  )
  with check (
    (
      public.consent_type_is_administrative(type)
      and public.is_org_member(organization_id)
    )
    or public.can_access_patient_clinical(organization_id, patient_id)
  );

drop policy if exists consent_files_select on public.consent_files;
drop policy if exists consent_files_insert on public.consent_files;

create policy consent_files_select
  on public.consent_files for select to authenticated
  using (
    exists (
      select 1 from public.consents c
      where c.id = consent_files.consent_id
        and (
          (
            public.consent_type_is_administrative(c.type)
            and public.is_org_member(c.organization_id)
          )
          or public.can_access_patient_clinical(c.organization_id, c.patient_id)
        )
    )
  );

create policy consent_files_insert
  on public.consent_files for insert to authenticated
  with check (
    exists (
      select 1 from public.consents c
      where c.id = consent_files.consent_id
        and c.organization_id = consent_files.organization_id
        and (
          (
            public.consent_type_is_administrative(c.type)
            and public.is_org_member(c.organization_id)
          )
          or public.can_access_patient_clinical(c.organization_id, c.patient_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

drop policy if exists document_templates_select on public.document_templates;

create policy document_templates_select
  on public.document_templates for select to authenticated
  using (
    public.is_clinical_practitioner(organization_id)
    or (public.is_org_member(organization_id) and default_sensitivity = 'administrative')
  );

drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;

create policy documents_select
  on public.documents for select to authenticated
  using (public.can_access_document(organization_id, patient_id, sensitivity));
create policy documents_insert
  on public.documents for insert to authenticated
  with check (public.can_access_document(organization_id, patient_id, sensitivity));
create policy documents_update
  on public.documents for update to authenticated
  using (public.can_access_document(organization_id, patient_id, sensitivity))
  with check (public.can_access_document(organization_id, patient_id, sensitivity));

drop policy if exists document_versions_select on public.document_versions;
drop policy if exists document_versions_insert on public.document_versions;

create policy document_versions_select
  on public.document_versions for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );
create policy document_versions_insert
  on public.document_versions for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );

drop policy if exists document_files_select on public.document_files;
drop policy if exists document_files_insert on public.document_files;

create policy document_files_select
  on public.document_files for select to authenticated
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_files.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );
create policy document_files_insert
  on public.document_files for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_files.document_id
        and public.can_access_document(d.organization_id, d.patient_id, d.sensitivity)
    )
  );

drop policy if exists patient_attachments_select on public.patient_attachments;
drop policy if exists patient_attachments_insert on public.patient_attachments;
drop policy if exists patient_attachments_delete on public.patient_attachments;

create policy patient_attachments_select
  on public.patient_attachments for select to authenticated
  using (public.can_access_document(organization_id, patient_id, sensitivity));
create policy patient_attachments_insert
  on public.patient_attachments for insert to authenticated
  with check (public.can_access_document(organization_id, patient_id, sensitivity));
create policy patient_attachments_delete
  on public.patient_attachments for delete to authenticated
  using (public.can_access_document(organization_id, patient_id, sensitivity));

-- ---------------------------------------------------------------------------
-- Knowledge library: clinical practitioners (not a patient chart)
-- ---------------------------------------------------------------------------

drop policy if exists knowledge_collections_admin_select on public.knowledge_collections;
drop policy if exists knowledge_collections_admin_insert on public.knowledge_collections;
drop policy if exists knowledge_collections_admin_update on public.knowledge_collections;
drop policy if exists knowledge_collections_admin_delete on public.knowledge_collections;

create policy knowledge_collections_clinical_select
  on public.knowledge_collections for select to authenticated
  using (public.is_clinical_practitioner(organization_id));
create policy knowledge_collections_clinical_insert
  on public.knowledge_collections for insert to authenticated
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_collections_clinical_update
  on public.knowledge_collections for update to authenticated
  using (public.is_clinical_practitioner(organization_id))
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_collections_clinical_delete
  on public.knowledge_collections for delete to authenticated
  using (public.is_clinical_practitioner(organization_id));

drop policy if exists knowledge_sources_admin_select on public.knowledge_sources;
drop policy if exists knowledge_sources_admin_insert on public.knowledge_sources;
drop policy if exists knowledge_sources_admin_update on public.knowledge_sources;
drop policy if exists knowledge_sources_admin_delete on public.knowledge_sources;

create policy knowledge_sources_clinical_select
  on public.knowledge_sources for select to authenticated
  using (public.is_clinical_practitioner(organization_id));
create policy knowledge_sources_clinical_insert
  on public.knowledge_sources for insert to authenticated
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_sources_clinical_update
  on public.knowledge_sources for update to authenticated
  using (public.is_clinical_practitioner(organization_id))
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_sources_clinical_delete
  on public.knowledge_sources for delete to authenticated
  using (public.is_clinical_practitioner(organization_id));

drop policy if exists knowledge_documents_admin_select on public.knowledge_documents;
drop policy if exists knowledge_documents_admin_insert on public.knowledge_documents;
drop policy if exists knowledge_documents_admin_update on public.knowledge_documents;
drop policy if exists knowledge_documents_admin_delete on public.knowledge_documents;

create policy knowledge_documents_clinical_select
  on public.knowledge_documents for select to authenticated
  using (public.is_clinical_practitioner(organization_id));
create policy knowledge_documents_clinical_insert
  on public.knowledge_documents for insert to authenticated
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_documents_clinical_update
  on public.knowledge_documents for update to authenticated
  using (public.is_clinical_practitioner(organization_id))
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_documents_clinical_delete
  on public.knowledge_documents for delete to authenticated
  using (public.is_clinical_practitioner(organization_id));

drop policy if exists knowledge_chunks_admin_select on public.knowledge_chunks;
drop policy if exists knowledge_chunks_admin_insert on public.knowledge_chunks;
drop policy if exists knowledge_chunks_admin_delete on public.knowledge_chunks;

create policy knowledge_chunks_clinical_select
  on public.knowledge_chunks for select to authenticated
  using (public.is_clinical_practitioner(organization_id));
create policy knowledge_chunks_clinical_insert
  on public.knowledge_chunks for insert to authenticated
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_chunks_clinical_delete
  on public.knowledge_chunks for delete to authenticated
  using (public.is_clinical_practitioner(organization_id));

drop policy if exists knowledge_embeddings_admin_select on public.knowledge_embeddings;
drop policy if exists knowledge_embeddings_admin_insert on public.knowledge_embeddings;
drop policy if exists knowledge_embeddings_admin_delete on public.knowledge_embeddings;

create policy knowledge_embeddings_clinical_select
  on public.knowledge_embeddings for select to authenticated
  using (public.is_clinical_practitioner(organization_id));
create policy knowledge_embeddings_clinical_insert
  on public.knowledge_embeddings for insert to authenticated
  with check (public.is_clinical_practitioner(organization_id));
create policy knowledge_embeddings_clinical_delete
  on public.knowledge_embeddings for delete to authenticated
  using (public.is_clinical_practitioner(organization_id));

drop policy if exists knowledge_sources_storage_admin_all on storage.objects;

create policy knowledge_sources_storage_clinical_all
  on storage.objects for all to authenticated
  using (
    bucket_id = 'knowledge-sources'
    and public.is_clinical_practitioner((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'knowledge-sources'
    and public.is_clinical_practitioner((storage.foldername(name))[1]::uuid)
  );
