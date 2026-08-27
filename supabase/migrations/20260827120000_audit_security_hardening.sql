-- Auditoria ago/2026: lock-down de EXECUTE em funções DEFINER, predicados
-- internos nas RPCs perigosas, convite só com e-mail confirmado, refresh
-- Google por membro, reaper de outbox WhatsApp e cancelamento externo.

-- ---------------------------------------------------------------------------
-- Hosted default privileges grant EXECUTE on new functions to anon. Revoke
-- that surface, then pin service_role-only RPCs.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon;

do $$
begin
  execute 'alter default privileges in schema public revoke all on functions from public';
  execute 'alter default privileges in schema public revoke all on functions from anon';
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from public';
    execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from anon';
  end if;
end
$$;

revoke all on table public.google_calendar_credentials from public, anon, authenticated;
revoke all on table public.patient_code_counters from public, anon, authenticated;

revoke all on function public.match_patients_by_whatsapp_e164(text) from public, anon, authenticated;
grant execute on function public.match_patients_by_whatsapp_e164(text) to service_role;

revoke all on function public.next_patient_public_code(uuid) from public, anon, authenticated;

revoke all on function public.claim_due_whatsapp_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_whatsapp_reminders(integer) to service_role;

revoke all on function public.mark_whatsapp_outbox_sending(uuid) from public, anon, authenticated;
revoke all on function public.mark_whatsapp_outbox_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.invoke_whatsapp_reminder_job() from public, anon, authenticated;
grant execute on function public.mark_whatsapp_outbox_sending(uuid) to service_role;
grant execute on function public.mark_whatsapp_outbox_sent(uuid, text) to service_role;
grant execute on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) to service_role;
grant execute on function public.invoke_whatsapp_reminder_job() to service_role;

revoke all on function public.purge_expired_fallback_audio() from public, anon, authenticated;
revoke all on function public.expire_stale_logical_exports() from public, anon, authenticated;
revoke all on function public.invoke_audio_retention_job() from public, anon, authenticated;
grant execute on function public.purge_expired_fallback_audio() to service_role;
grant execute on function public.expire_stale_logical_exports() to service_role;
grant execute on function public.invoke_audio_retention_job() to service_role;

-- ---------------------------------------------------------------------------
-- match_patients: service_role only, even if a GRANT leaks back.
-- ---------------------------------------------------------------------------

create or replace function public.match_patients_by_whatsapp_e164(p_e164 text)
returns table (organization_id uuid, patient_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with wanted as (
    select regexp_replace(coalesce(p_e164, ''), '\D', '', 'g') as digits
  )
  select p.organization_id, p.id
  from public.patients p
  cross join wanted w
  where btrim(coalesce(p.phone, '')) <> ''
    and (
      regexp_replace(p.phone, '\D', '', 'g') = w.digits
      or ('55' || regexp_replace(p.phone, '\D', '', 'g')) = w.digits
      or regexp_replace(p.phone, '\D', '', 'g') = right(w.digits, 11)
      or regexp_replace(p.phone, '\D', '', 'g') = right(w.digits, 10)
    );
end;
$$;

revoke all on function public.match_patients_by_whatsapp_e164(text) from public, anon, authenticated;
grant execute on function public.match_patients_by_whatsapp_e164(text) to service_role;

-- ---------------------------------------------------------------------------
-- WhatsApp helpers: anon must not skip membership; service_role still may.
-- ---------------------------------------------------------------------------

create or replace function public.patient_whatsapp_allowed(p_org_id uuid, p_patient_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role'
     and not public.is_org_member(p_org_id) then
    return false;
  end if;

  return exists (
    select 1
    from public.communication_preferences p
    join public.consents c
      on c.patient_id = p.patient_id
     and c.organization_id = p.organization_id
     and c.type = 'whatsapp'
     and c.status = 'accepted'
    where p.organization_id = p_org_id
      and p.patient_id = p_patient_id
      and p.whatsapp_enabled
  );
end;
$$;

create or replace function public.enqueue_appointment_whatsapp_reminders(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appt record;
  lead_24 numeric;
  lead_2 numeric;
  when_24 timestamptz;
  when_2 timestamptz;
begin
  select a.id, a.organization_id, a.patient_id, a.starts_at, a.origin, a.status
    into appt
  from public.appointments a
  where a.id = p_appointment_id;

  if appt.id is null then
    return;
  end if;
  if (select auth.role()) is distinct from 'service_role'
     and (auth.uid() is null or not public.is_org_member(appt.organization_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if appt.origin <> 'TESSELI' or appt.patient_id is null then
    return;
  end if;
  if appt.status in ('cancelled', 'completed') then
    update public.whatsapp_reminder_outbox
       set state = 'canceled'
     where appointment_id = appt.id
       and state in ('scheduled', 'retryable_failed', 'claimed');
    return;
  end if;
  if not public.patient_whatsapp_allowed(appt.organization_id, appt.patient_id) then
    update public.whatsapp_reminder_outbox
       set state = 'canceled'
     where appointment_id = appt.id
       and state in ('scheduled', 'retryable_failed', 'claimed');
    return;
  end if;

  perform public.ensure_whatsapp_templates(appt.organization_id);

  select reminder_lead_hours_24, reminder_lead_hours_2
    into lead_24, lead_2
  from public.practice_settings
  where organization_id = appt.organization_id;

  lead_24 := coalesce(lead_24, 24);
  lead_2 := coalesce(lead_2, 2);
  when_24 := appt.starts_at - (lead_24 * interval '1 hour');
  when_2 := appt.starts_at - (lead_2 * interval '1 hour');

  if when_24 > now() then
    insert into public.whatsapp_reminder_outbox (
      organization_id, appointment_id, patient_id, reminder_type, scheduled_for, state
    ) values (
      appt.organization_id, appt.id, appt.patient_id, 'reminder_24h', when_24, 'scheduled'
    )
    on conflict (appointment_id, reminder_type) do update
      set scheduled_for = excluded.scheduled_for,
          state = case
            when public.whatsapp_reminder_outbox.state in ('sent', 'sending') then public.whatsapp_reminder_outbox.state
            else 'scheduled'
          end,
          next_attempt_at = null,
          last_error_code = null
      where public.whatsapp_reminder_outbox.state not in ('sent', 'sending');
  end if;

  if when_2 > now() then
    insert into public.whatsapp_reminder_outbox (
      organization_id, appointment_id, patient_id, reminder_type, scheduled_for, state
    ) values (
      appt.organization_id, appt.id, appt.patient_id, 'reminder_2h', when_2, 'scheduled'
    )
    on conflict (appointment_id, reminder_type) do update
      set scheduled_for = excluded.scheduled_for,
          state = case
            when public.whatsapp_reminder_outbox.state in ('sent', 'sending') then public.whatsapp_reminder_outbox.state
            else 'scheduled'
          end,
          next_attempt_at = null,
          last_error_code = null
      where public.whatsapp_reminder_outbox.state not in ('sent', 'sending');
  end if;
end;
$$;

create or replace function public.sync_patient_whatsapp_outbox(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  appt record;
  pref_org uuid;
begin
  select organization_id into pref_org
  from public.communication_preferences
  where patient_id = p_patient_id;

  if pref_org is null then
    return;
  end if;
  if (select auth.role()) is distinct from 'service_role'
     and (auth.uid() is null or not public.is_org_member(pref_org)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not public.patient_whatsapp_allowed(pref_org, p_patient_id) then
    update public.whatsapp_reminder_outbox
       set state = 'canceled'
     where patient_id = p_patient_id
       and state in ('scheduled', 'retryable_failed', 'claimed');
    return;
  end if;

  for appt in
    select id
    from public.appointments
    where patient_id = p_patient_id
      and organization_id = pref_org
      and origin = 'TESSELI'
      and status in ('scheduled', 'confirmed')
  loop
    perform public.enqueue_appointment_whatsapp_reminders(appt.id);
  end loop;
end;
$$;

-- Reclaim stale claimed/sending so a timed-out job does not lose the lote.
create or replace function public.claim_due_whatsapp_reminders(p_limit integer default 20)
returns setof public.whatsapp_reminder_outbox
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.whatsapp_reminder_outbox
     set state = 'retryable_failed',
         next_attempt_at = now(),
         last_error_code = 'stale_claim'
   where state in ('claimed', 'sending')
     and claimed_at is not null
     and claimed_at < now() - interval '15 minutes';

  return query
  with due as (
    select o.id
    from public.whatsapp_reminder_outbox o
    join public.organizations org on org.id = o.organization_id
    left join public.communication_preferences pref
      on pref.patient_id = o.patient_id
     and pref.organization_id = o.organization_id
    where o.state in ('scheduled', 'retryable_failed')
      and coalesce(o.next_attempt_at, o.scheduled_for) <= now()
      and (
        pref.quiet_hours_start is null
        or pref.quiet_hours_end is null
        or not (
          case
            when pref.quiet_hours_start < pref.quiet_hours_end then
              (timezone(org.timezone, now()))::time >= pref.quiet_hours_start
              and (timezone(org.timezone, now()))::time < pref.quiet_hours_end
            else
              (timezone(org.timezone, now()))::time >= pref.quiet_hours_start
              or (timezone(org.timezone, now()))::time < pref.quiet_hours_end
          end
        )
      )
    order by coalesce(o.next_attempt_at, o.scheduled_for)
    limit greatest(coalesce(p_limit, 20), 1)
    for update of o skip locked
  )
  update public.whatsapp_reminder_outbox o
     set state = 'claimed',
         claimed_at = now(),
         attempt_count = o.attempt_count + 1
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

revoke all on function public.claim_due_whatsapp_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_whatsapp_reminders(integer) to service_role;

-- ---------------------------------------------------------------------------
-- finance_period_is_closed: membership or service_role (used by triggers).
-- ---------------------------------------------------------------------------

create or replace function public.finance_period_is_closed(org_id uuid, competence date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role'
     and not public.is_org_member(org_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.financial_closings c
    where c.organization_id = org_id
      and c.status = 'closed'
      and competence between c.period_start and c.period_end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Patient audit: no existence oracle for outsiders.
-- ---------------------------------------------------------------------------

create or replace function public.log_patient_audit_event(
  patient_id uuid,
  action text,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target_code text;
begin
  select organization_id, public_code
  into target_org, target_code
  from public.patients
  where id = patient_id;

  if target_org is null or not public.can_access_patient_record(target_org, patient_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return public.log_audit_event(target_org, action, 'patient', target_code, metadata);
end;
$$;

-- ---------------------------------------------------------------------------
-- Invitations: only a confirmed e-mail may accept.
-- ---------------------------------------------------------------------------

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
  where u.id = actor
    and u.email_confirmed_at is not null;

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

-- ---------------------------------------------------------------------------
-- Google: first-time connect remains admin; token refresh is any member.
-- ---------------------------------------------------------------------------

create or replace function public.upsert_google_credentials(
  org_id uuid,
  p_access_token_encrypted text,
  p_access_token_expires_at timestamptz,
  p_refresh_token_encrypted text,
  p_google_account_email text default null,
  p_scopes text[] default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  already_connected boolean;
begin
  if not public.is_org_member(org_id) then
    raise exception 'google calendar credentials require an active membership'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from public.google_calendar_credentials c where c.organization_id = org_id
  ) into already_connected;

  if not already_connected and not public.is_psychologist_admin(org_id) then
    raise exception 'only psychologist_admin may connect Google Calendar'
      using errcode = '42501';
  end if;

  insert into public.google_calendar_credentials (
    organization_id, access_token_encrypted, access_token_expires_at,
    refresh_token_encrypted
  )
  values (org_id, p_access_token_encrypted, p_access_token_expires_at, p_refresh_token_encrypted)
  on conflict (organization_id) do update set
    access_token_encrypted = excluded.access_token_encrypted,
    access_token_expires_at = excluded.access_token_expires_at,
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, public.google_calendar_credentials.refresh_token_encrypted),
    updated_at = now();

  insert into public.google_calendar_connections (
    organization_id, status, google_account_email, scopes, connected_by_user_id
  )
  values (
    org_id, 'connected', p_google_account_email,
    coalesce(p_scopes, array[]::text[]), auth.uid()
  )
  on conflict (organization_id) do update set
    status = 'connected',
    google_account_email = coalesce(excluded.google_account_email, public.google_calendar_connections.google_account_email),
    scopes = case
      when p_scopes is not null then excluded.scopes
      else public.google_calendar_connections.scopes
    end,
    last_sync_error = null;
end;
$$;

create or replace function public.mark_external_appointment_cancelled(
  org_id uuid,
  p_google_calendar_id text,
  p_google_event_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(org_id) then
    raise exception 'external appointment cancel requires an active membership'
      using errcode = '42501';
  end if;

  update public.appointments
     set status = 'cancelled',
         sync_status = 'synced',
         last_synced_at = now()
   where organization_id = org_id
     and google_calendar_id = p_google_calendar_id
     and google_event_id = p_google_event_id
     and origin = 'GOOGLE_EXTERNAL';
end;
$$;

revoke all on function public.mark_external_appointment_cancelled(uuid, text, text) from public, anon;
grant execute on function public.mark_external_appointment_cancelled(uuid, text, text) to authenticated;

-- CREATE OR REPLACE re-applies hosted default EXECUTE-to-anon. Strip it again
-- after every replacement in this file.
revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon;

revoke all on function public.match_patients_by_whatsapp_e164(text) from public, anon, authenticated;
grant execute on function public.match_patients_by_whatsapp_e164(text) to service_role;
revoke all on function public.next_patient_public_code(uuid) from public, anon, authenticated;
revoke all on function public.claim_due_whatsapp_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_whatsapp_reminders(integer) to service_role;
revoke all on function public.mark_whatsapp_outbox_sending(uuid) from public, anon, authenticated;
revoke all on function public.mark_whatsapp_outbox_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.invoke_whatsapp_reminder_job() from public, anon, authenticated;
grant execute on function public.mark_whatsapp_outbox_sending(uuid) to service_role;
grant execute on function public.mark_whatsapp_outbox_sent(uuid, text) to service_role;
grant execute on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) to service_role;
grant execute on function public.invoke_whatsapp_reminder_job() to service_role;
