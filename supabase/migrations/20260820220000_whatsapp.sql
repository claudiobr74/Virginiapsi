-- Tesseli — Phase 11: Twilio WhatsApp (preferences, outbox, messages, inbound).
-- Specs: prompts/11-twilio.md, docs/04-data-model.md §Comunicação,
-- docs/06-integrations.md §2, docs/03-architecture.md (pg_cron + pg_net).
--
-- Vault secret *values* are never written here. Operators provision
-- `tesseli_app_url` and `tesseli_cron_secret` in Supabase Vault; the cron
-- function reads them at runtime.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.whatsapp_reminder_type as enum (
  'reminder_24h',
  'reminder_2h'
);

create type public.whatsapp_outbox_state as enum (
  'scheduled',
  'claimed',
  'sending',
  'sent',
  'retryable_failed',
  'permanent_failed',
  'canceled'
);

create type public.whatsapp_direction as enum (
  'outbound',
  'inbound'
);

create type public.whatsapp_template_key as enum (
  'confirmation',
  'reminder_24h',
  'reminder_2h',
  'welcome',
  'billing'
);

create type public.whatsapp_inbound_intent as enum (
  'confirm',
  'decline_pending',
  'reschedule_pending',
  'unknown'
);

-- Configurable lead times for the 24h/2h reminders (hours before start).
alter table public.practice_settings
  add column if not exists reminder_lead_hours_24 numeric not null default 24
    check (reminder_lead_hours_24 > 0 and reminder_lead_hours_24 <= 168),
  add column if not exists reminder_lead_hours_2 numeric not null default 2
    check (reminder_lead_hours_2 > 0 and reminder_lead_hours_2 < 24);

-- ---------------------------------------------------------------------------
-- communication_preferences
-- ---------------------------------------------------------------------------

create table public.communication_preferences (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  whatsapp_enabled boolean not null default false,
  consent_id uuid references public.consents (id) on delete set null,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index communication_preferences_org_idx
  on public.communication_preferences (organization_id);

create trigger communication_preferences_set_updated_at
  before update on public.communication_preferences
  for each row execute function public.set_updated_at();

create or replace function public.assert_communication_preference_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
  consent_ok boolean := false;
begin
  select organization_id into patient_org from public.patients where id = new.patient_id;
  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'communication preference patient must belong to the same organization'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.patient_id := old.patient_id;
  end if;
  if new.whatsapp_enabled then
    select exists (
      select 1
      from public.consents c
      where c.patient_id = new.patient_id
        and c.organization_id = new.organization_id
        and c.type = 'whatsapp'
        and c.status = 'accepted'
        and (new.consent_id is null or c.id = new.consent_id)
    ) into consent_ok;
    if not consent_ok then
      raise exception 'whatsapp preference requires an accepted whatsapp consent'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger communication_preferences_assert_consistency
  before insert or update on public.communication_preferences
  for each row execute function public.assert_communication_preference_consistency();

alter table public.communication_preferences enable row level security;

create policy communication_preferences_select on public.communication_preferences
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy communication_preferences_insert on public.communication_preferences
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy communication_preferences_update on public.communication_preferences
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.communication_preferences from public, anon;
grant select, insert, update on public.communication_preferences to authenticated;
grant select, insert, update on public.communication_preferences to service_role;

-- Secretaria opera o canal administrativo (WhatsApp / termos). Insert/update
-- of clinical consents remains psychologist_admin-only (Fase 5.5).
create policy consents_insert_administrative
  on public.consents
  for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.consent_type_is_administrative(type)
  );

create policy consents_update_administrative
  on public.consents
  for update
  to authenticated
  using (
    public.is_org_member(organization_id)
    and public.consent_type_is_administrative(type)
  )
  with check (
    public.is_org_member(organization_id)
    and public.consent_type_is_administrative(type)
  );

-- ---------------------------------------------------------------------------
-- whatsapp_templates
-- ---------------------------------------------------------------------------

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_key public.whatsapp_template_key not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  twilio_content_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key)
);

create trigger whatsapp_templates_set_updated_at
  before update on public.whatsapp_templates
  for each row execute function public.set_updated_at();

alter table public.whatsapp_templates enable row level security;

create policy whatsapp_templates_select on public.whatsapp_templates
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy whatsapp_templates_write on public.whatsapp_templates
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy whatsapp_templates_update on public.whatsapp_templates
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.whatsapp_templates from public, anon;
grant select, insert, update on public.whatsapp_templates to authenticated;
grant select, insert, update on public.whatsapp_templates to service_role;

create or replace function public.ensure_whatsapp_templates(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.whatsapp_templates (organization_id, template_key, body)
  values
    (p_org_id, 'confirmation', 'Olá, {{patient_name}}! Confirmamos sua sessão em {{starts_at}}. Qualquer imprevisto, responda esta mensagem.'),
    (p_org_id, 'reminder_24h', 'Olá, {{patient_name}}! Lembrete: sua sessão é amanhã, {{starts_at}}. Responda SIM para confirmar.'),
    (p_org_id, 'reminder_2h', 'Olá, {{patient_name}}! Sua sessão começa em cerca de 2 horas ({{starts_at}}). Até breve.'),
    (p_org_id, 'welcome', 'Olá, {{patient_name}}! Este é o canal administrativo do consultório. Avisos de sessão e confirmações chegam por aqui.'),
    (p_org_id, 'billing', 'Olá, {{patient_name}}! Segue o lembrete administrativo referente ao valor combinado da sessão. Qualquer dúvida, fale conosco.')
  on conflict (organization_id, template_key) do nothing;
end;
$$;

revoke all on function public.ensure_whatsapp_templates(uuid) from public;
grant execute on function public.ensure_whatsapp_templates(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- whatsapp_reminder_outbox
-- ---------------------------------------------------------------------------

create table public.whatsapp_reminder_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  reminder_type public.whatsapp_reminder_type not null,
  scheduled_for timestamptz not null,
  state public.whatsapp_outbox_state not null default 'scheduled',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  twilio_message_sid text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, reminder_type)
);

create index whatsapp_reminder_outbox_due_idx
  on public.whatsapp_reminder_outbox (
    coalesce(next_attempt_at, scheduled_for)
  )
  where state in ('scheduled', 'retryable_failed');

create trigger whatsapp_reminder_outbox_set_updated_at
  before update on public.whatsapp_reminder_outbox
  for each row execute function public.set_updated_at();

alter table public.whatsapp_reminder_outbox enable row level security;

create policy whatsapp_outbox_select on public.whatsapp_reminder_outbox
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy whatsapp_outbox_insert on public.whatsapp_reminder_outbox
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy whatsapp_outbox_update on public.whatsapp_reminder_outbox
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.whatsapp_reminder_outbox from public, anon;
grant select, insert, update on public.whatsapp_reminder_outbox to authenticated;
grant select, insert, update on public.whatsapp_reminder_outbox to service_role;

-- ---------------------------------------------------------------------------
-- whatsapp_messages (outbound log)
-- ---------------------------------------------------------------------------

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  outbox_id uuid references public.whatsapp_reminder_outbox (id) on delete set null,
  direction public.whatsapp_direction not null default 'outbound',
  message_sid text,
  template_key public.whatsapp_template_key,
  status text not null default 'queued',
  to_number text not null,
  scheduled_for timestamptz,
  sent_at timestamptz,
  -- Minimized: never store clinical content. Templates are administrative.
  body_redacted text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create unique index whatsapp_messages_sid_unique
  on public.whatsapp_messages (message_sid)
  where message_sid is not null;

create trigger whatsapp_messages_set_updated_at
  before update on public.whatsapp_messages
  for each row execute function public.set_updated_at();

alter table public.whatsapp_messages enable row level security;

create policy whatsapp_messages_select on public.whatsapp_messages
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy whatsapp_messages_insert on public.whatsapp_messages
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy whatsapp_messages_update on public.whatsapp_messages
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

revoke all on public.whatsapp_messages from public, anon;
grant select, insert, update on public.whatsapp_messages to authenticated;
grant select, insert, update on public.whatsapp_messages to service_role;

-- ---------------------------------------------------------------------------
-- whatsapp_inbound_messages
-- ---------------------------------------------------------------------------

create table public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  message_sid text not null unique,
  from_number text not null,
  -- Stored only after minimization; inbound parser keeps a short intent token.
  body_redacted text,
  processed boolean not null default false,
  intent public.whatsapp_inbound_intent not null default 'unknown',
  created_at timestamptz not null default now()
);

alter table public.whatsapp_inbound_messages enable row level security;

create policy whatsapp_inbound_select on public.whatsapp_inbound_messages
  for select to authenticated
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

create policy whatsapp_inbound_insert on public.whatsapp_inbound_messages
  for insert to authenticated
  with check (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

create policy whatsapp_inbound_update on public.whatsapp_inbound_messages
  for update to authenticated
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  )
  with check (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

revoke all on public.whatsapp_inbound_messages from public, anon;
grant select, insert, update on public.whatsapp_inbound_messages to authenticated;
grant select, insert, update on public.whatsapp_inbound_messages to service_role;

-- ---------------------------------------------------------------------------
-- Enqueue / cancel (SECURITY DEFINER, membership-checked except service_role)
-- ---------------------------------------------------------------------------

create or replace function public.patient_whatsapp_allowed(p_org_id uuid, p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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
$$;

revoke all on function public.patient_whatsapp_allowed(uuid, uuid) from public;
grant execute on function public.patient_whatsapp_allowed(uuid, uuid) to authenticated, service_role;

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
  if (select auth.role()) <> 'service_role'
     and auth.uid() is not null
     and not public.is_org_member(appt.organization_id) then
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

revoke all on function public.enqueue_appointment_whatsapp_reminders(uuid) from public;
grant execute on function public.enqueue_appointment_whatsapp_reminders(uuid) to authenticated, service_role;

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
  if (select auth.role()) <> 'service_role'
     and auth.uid() is not null
     and not public.is_org_member(pref_org) then
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

revoke all on function public.sync_patient_whatsapp_outbox(uuid) from public;
grant execute on function public.sync_patient_whatsapp_outbox(uuid) to authenticated, service_role;

create or replace function public.communication_preferences_sync_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_patient_whatsapp_outbox(new.patient_id);
  return new;
end;
$$;

create trigger communication_preferences_sync_whatsapp
  after insert or update of whatsapp_enabled, consent_id on public.communication_preferences
  for each row execute function public.communication_preferences_sync_whatsapp();

create or replace function public.appointments_sync_whatsapp_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_appointment_whatsapp_reminders(new.id);
  return new;
end;
$$;

create trigger appointments_sync_whatsapp_outbox
  after insert or update of starts_at, status, patient_id on public.appointments
  for each row execute function public.appointments_sync_whatsapp_outbox();

-- ---------------------------------------------------------------------------
-- Atomic claim (service_role only — called by the Next.js cron job)
-- ---------------------------------------------------------------------------

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

revoke all on function public.claim_due_whatsapp_reminders(integer) from public;
grant execute on function public.claim_due_whatsapp_reminders(integer) to service_role;

-- Locate a patient by inbound WhatsApp E.164 without leaking across tenants
-- in the application layer: the webhook only uses a row when the match is unique.
create or replace function public.match_patients_by_whatsapp_e164(p_e164 text)
returns table (organization_id uuid, patient_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.match_patients_by_whatsapp_e164(text) from public;
grant execute on function public.match_patients_by_whatsapp_e164(text) to service_role;

create or replace function public.mark_whatsapp_outbox_sending(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.whatsapp_reminder_outbox
     set state = 'sending'
   where id = p_id
     and state = 'claimed';
end;
$$;

create or replace function public.mark_whatsapp_outbox_sent(p_id uuid, p_sid text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.whatsapp_reminder_outbox
     set state = 'sent',
         twilio_message_sid = p_sid,
         sent_at = now(),
         last_error_code = null
   where id = p_id;
end;
$$;

create or replace function public.mark_whatsapp_outbox_failed(
  p_id uuid,
  p_retryable boolean,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempts integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select attempt_count into attempts
  from public.whatsapp_reminder_outbox
  where id = p_id;
  if p_retryable and coalesce(attempts, 0) < 5 then
    update public.whatsapp_reminder_outbox
       set state = 'retryable_failed',
           last_error_code = left(p_error_code, 80),
           next_attempt_at = now() + (interval '2 minutes' * attempts)
     where id = p_id;
  else
    update public.whatsapp_reminder_outbox
       set state = 'permanent_failed',
           last_error_code = left(p_error_code, 80)
     where id = p_id;
  end if;
end;
$$;

revoke all on function public.mark_whatsapp_outbox_sending(uuid) from public;
revoke all on function public.mark_whatsapp_outbox_sent(uuid, text) from public;
revoke all on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) from public;
grant execute on function public.mark_whatsapp_outbox_sending(uuid) to service_role;
grant execute on function public.mark_whatsapp_outbox_sent(uuid, text) to service_role;
grant execute on function public.mark_whatsapp_outbox_failed(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduler: read Vault (no secret values here) + pg_net POST
-- ---------------------------------------------------------------------------

create or replace function public.invoke_whatsapp_reminder_job()
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
      url := rtrim(app_url, '/') || '/api/jobs/whatsapp-reminders',
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

revoke all on function public.invoke_whatsapp_reminder_job() from public;
grant execute on function public.invoke_whatsapp_reminder_job() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      perform cron.schedule(
        'tesseli-whatsapp-reminders',
        '*/5 * * * *',
        'select public.invoke_whatsapp_reminder_job()'
      );
    end if;
  end if;
exception
  when others then
    -- Local test Postgres may lack pg_cron privileges; the Next.js job
    -- remains the processor and can be invoked directly in tests.
    null;
end;
$$;
