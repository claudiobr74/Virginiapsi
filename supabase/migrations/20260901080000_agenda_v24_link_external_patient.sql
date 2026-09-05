-- Agenda V2.4: link a patient to a GOOGLE_EXTERNAL mirror without touching Google.
--
-- update_external_appointment_mirror already accepts p_patient_id, but it also
-- rewrites starts/ends/summary/status/sync metadata and does not refuse
-- google_deleted_at tombstones. Linking is local VirginiaPsi metadata only, so
-- this dedicated SECURITY DEFINER function updates patient_id and nothing else.

create or replace function public.link_external_appointment_patient(
  org_id uuid,
  p_appointment_id uuid,
  p_patient_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result_id uuid;
  patient_org uuid;
begin
  if not public.is_org_member(org_id) then
    raise exception 'external appointment link requires an active membership'
      using errcode = '42501';
  end if;

  if p_patient_id is null then
    raise exception 'patient is required'
      using errcode = '23502';
  end if;

  select p.organization_id into patient_org
  from public.patients p
  where p.id = p_patient_id;

  if patient_org is null or patient_org <> org_id then
    raise exception 'appointment patient must belong to the same organization'
      using errcode = '23514';
  end if;

  update public.appointments
  set patient_id = p_patient_id
  where id = p_appointment_id
    and organization_id = org_id
    and origin = 'GOOGLE_EXTERNAL'
    and google_deleted_at is null
  returning id into result_id;

  if result_id is null then
    raise exception 'external appointment not found'
      using errcode = 'P0002';
  end if;

  return result_id;
end;
$$;

revoke all on function public.link_external_appointment_patient(uuid, uuid, uuid) from public;
revoke all on function public.link_external_appointment_patient(uuid, uuid, uuid) from anon;
grant execute on function public.link_external_appointment_patient(uuid, uuid, uuid) to authenticated;
grant execute on function public.link_external_appointment_patient(uuid, uuid, uuid) to service_role;
