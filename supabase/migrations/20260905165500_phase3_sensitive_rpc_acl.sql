-- Fase 3.2 release validation hardening.
-- Restrict sensitive SECURITY DEFINER helpers that must not be callable by anon.

-- Internal patient-code allocator: it is reached through trusted database logic,
-- not directly from browser/API clients.
revoke execute on function public.next_patient_public_code(uuid)
  from public, anon, authenticated;
grant execute on function public.next_patient_public_code(uuid)
  to service_role;

-- Internal retention scheduler: pg_cron/database owner may execute it; API clients may not.
revoke execute on function public.invoke_audio_retention_job()
  from public, anon, authenticated;
grant execute on function public.invoke_audio_retention_job()
  to service_role;

-- Keep the authenticated application path for WhatsApp resync, but explicitly
-- reject anonymous callers even when auth.uid() is null.
create or replace function public.sync_patient_whatsapp_outbox(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke execute on function public.sync_patient_whatsapp_outbox(uuid)
  from public, anon;
grant execute on function public.sync_patient_whatsapp_outbox(uuid)
  to authenticated, service_role;
