-- VirgíniaPsi — Financeiro v2 / Fase 1.
-- Critical financial rules only:
-- 1) a closed competence period remains immutable for charges/expenses;
-- 2) a later cash receipt may settle a charge from a closed competence;
-- 3) session competence follows the organization's configured timezone.

-- Payments are cash facts. Their paid_at date may occur after the charge's
-- competence has been closed, so the charge competence must not lock INSERTs
-- or void/audit UPDATEs on financial_payments.
drop trigger if exists financial_payments_period_lock on public.financial_payments;

create or replace function public.create_session_charge(
  p_session_id uuid,
  org_id uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  sess record;
  fee numeric(12, 2);
  existing uuid;
  existing_consume uuid;
  active_plan public.financial_plans%rowtype;
  new_id uuid;
  competence date;
  org_timezone text;
begin
  if not public.can_write_finance(org_id) then
    raise exception 'not authorized to write finance' using errcode = '42501';
  end if;

  select cs.id, cs.organization_id, cs.patient_id, cs.started_at
    into sess
  from public.clinical_sessions cs
  where cs.id = p_session_id and cs.organization_id = org_id;
  if sess.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  select o.timezone into org_timezone
  from public.organizations o
  where o.id = org_id;

  if org_timezone is null or btrim(org_timezone) = '' then
    raise exception 'organization timezone is not configured' using errcode = 'P0001';
  end if;

  -- PostgreSQL validates the IANA timezone identifier when AT TIME ZONE runs.
  competence := (sess.started_at at time zone org_timezone)::date;

  select id into existing
  from public.financial_charges
  where organization_id = org_id and session_id = p_session_id;
  if existing is not null then
    return existing;
  end if;

  select id into existing_consume
  from public.financial_plan_movements
  where organization_id = org_id
    and session_id = p_session_id
    and movement = 'consume';
  if existing_consume is not null then
    return null;
  end if;

  select * into active_plan
  from public.financial_plans
  where organization_id = org_id
    and patient_id = sess.patient_id
    and status = 'active'
    and (valid_from is null or valid_from <= competence)
    and (valid_until is null or valid_until >= competence)
  order by created_at
  limit 1;

  if found then
    if active_plan.plan_type = 'monthly' then
      return null;
    end if;
    if active_plan.plan_type in ('prepaid_package', 'postpaid_package')
       and (active_plan.total_sessions is null
            or active_plan.used_sessions < active_plan.total_sessions) then
      insert into public.financial_plan_movements (
        organization_id, plan_id, session_id, movement, delta, reason
      ) values (
        org_id, active_plan.id, p_session_id, 'consume', 1, 'Consumo na finalização da sessão'
      );
      return null;
    end if;
  end if;

  select default_session_value into fee
  from public.patients
  where id = sess.patient_id;
  if fee is null or fee <= 0 then
    return null;
  end if;

  insert into public.financial_charges (
    organization_id, patient_id, session_id, origin, description,
    amount, due_date, competence_date, status
  ) values (
    org_id,
    sess.patient_id,
    p_session_id,
    'session',
    'Sessão clínica',
    fee,
    competence,
    competence,
    'pending'
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_session_charge(uuid, uuid) from public;
grant execute on function public.create_session_charge(uuid, uuid) to authenticated;
