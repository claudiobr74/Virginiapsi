-- VirgíniaPsi — Financeiro v2 / Fase 1.
-- Critical financial rules only:
-- 1) a closed competence period remains immutable for economic charge/expense edits;
-- 2) a later cash receipt may settle a charge from a closed competence;
-- 3) derived payment status may refresh on an otherwise immutable closed charge;
-- 4) session competence follows the organization's configured timezone;
-- 5) plan + initial charge creation is atomic for prepaid/monthly plans.

-- Payments are cash facts. Their paid_at date may occur after the charge's
-- competence has been closed, so the charge competence must not lock INSERTs
-- or void/audit UPDATEs on financial_payments.
drop trigger if exists financial_payments_period_lock on public.financial_payments;

-- Keep closed charge competences immutable, except for the status that is
-- mechanically derived by refresh_charge_status() from non-voided payments.
-- This exception deliberately excludes canceled/refunded transitions and any
-- economic or descriptive field change.
create or replace function public.assert_finance_period_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  competence date;
  org uuid;
  derived_status_only boolean := false;
begin
  org := coalesce(new.organization_id, old.organization_id);

  if tg_table_name = 'financial_charges' then
    competence := coalesce(new.competence_date, old.competence_date);

    if tg_op = 'UPDATE' then
      derived_status_only :=
        old.status in ('pending', 'overdue', 'partially_paid', 'paid')
        and new.status in ('pending', 'overdue', 'partially_paid', 'paid')
        and new.organization_id is not distinct from old.organization_id
        and new.patient_id is not distinct from old.patient_id
        and new.session_id is not distinct from old.session_id
        and new.plan_id is not distinct from old.plan_id
        and new.origin is not distinct from old.origin
        and new.description is not distinct from old.description
        and new.amount is not distinct from old.amount
        and new.due_date is not distinct from old.due_date
        and new.competence_date is not distinct from old.competence_date
        and new.canceled_at is not distinct from old.canceled_at
        and new.canceled_by is not distinct from old.canceled_by
        and new.cancel_reason is not distinct from old.cancel_reason
        and new.nfse_requested_at is not distinct from old.nfse_requested_at
        and new.idempotency_key is not distinct from old.idempotency_key
        and new.created_by is not distinct from old.created_by
        and new.created_at is not distinct from old.created_at;

      if derived_status_only then
        return new;
      end if;
    end if;
  elsif tg_table_name = 'financial_payments' then
    -- Kept for backwards safety if a deployment still has the legacy trigger.
    -- Cash facts are intentionally governed by paid_at, not charge competence.
    return new;
  elsif tg_table_name = 'financial_expenses' then
    competence := coalesce(new.due_date, old.due_date, current_date);
  else
    competence := current_date;
  end if;

  if competence is not null and public.finance_period_is_closed(org, competence) then
    raise exception 'financial period is closed for this competence date'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

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
  select cs.id, cs.organization_id, cs.patient_id, cs.started_at into sess
  from public.clinical_sessions cs
  where cs.id = p_session_id and cs.organization_id = org_id;
  if sess.id is null then raise exception 'session not found' using errcode = 'P0002'; end if;
  select o.timezone into org_timezone from public.organizations o where o.id = org_id;
  if org_timezone is null or btrim(org_timezone) = '' then
    raise exception 'organization timezone is not configured' using errcode = 'P0001';
  end if;
  competence := (sess.started_at at time zone org_timezone)::date;
  select id into existing from public.financial_charges
  where organization_id = org_id and session_id = p_session_id;
  if existing is not null then return existing; end if;
  select id into existing_consume from public.financial_plan_movements
  where organization_id = org_id and session_id = p_session_id and movement = 'consume';
  if existing_consume is not null then return null; end if;
  select * into active_plan from public.financial_plans
  where organization_id = org_id and patient_id = sess.patient_id and status = 'active'
    and (valid_from is null or valid_from <= competence)
    and (valid_until is null or valid_until >= competence)
  order by created_at limit 1;
  if found then
    if active_plan.plan_type = 'monthly' then return null; end if;
    if active_plan.plan_type in ('prepaid_package', 'postpaid_package')
       and (active_plan.total_sessions is null or active_plan.used_sessions < active_plan.total_sessions) then
      insert into public.financial_plan_movements (
        organization_id, plan_id, session_id, movement, delta, reason
      ) values (org_id, active_plan.id, p_session_id, 'consume', 1, 'Consumo na finalização da sessão');
      return null;
    end if;
  end if;
  select default_session_value into fee from public.patients where id = sess.patient_id;
  if fee is null or fee <= 0 then return null; end if;
  insert into public.financial_charges (
    organization_id, patient_id, session_id, origin, description, amount, due_date, competence_date, status
  ) values (
    org_id, sess.patient_id, p_session_id, 'session', 'Sessão clínica', fee, competence, competence, 'pending'
  ) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_session_charge(uuid, uuid) from public;
grant execute on function public.create_session_charge(uuid, uuid) to authenticated;

create or replace function public.create_financial_plan_with_initial_charge(
  org_id uuid,
  p_patient_id uuid,
  p_plan_type public.financial_plan_type,
  p_total_sessions integer,
  p_price numeric(12, 2),
  p_valid_from date default null,
  p_valid_until date default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  new_plan_id uuid;
  charge_origin public.financial_charge_origin;
  charge_description text;
  charge_date date;
  org_timezone text;
begin
  if not public.can_write_finance(org_id) then
    raise exception 'not authorized to write finance' using errcode = '42501';
  end if;
  if p_plan_type <> 'monthly'::public.financial_plan_type
     and (p_total_sessions is null or p_total_sessions <= 0) then
    raise exception 'total sessions is required for package plans' using errcode = '23514';
  end if;
  insert into public.financial_plans (
    organization_id, patient_id, plan_type, total_sessions, price, valid_from, valid_until
  ) values (
    org_id, p_patient_id, p_plan_type, p_total_sessions, p_price, p_valid_from, p_valid_until
  ) returning id into new_plan_id;
  if p_plan_type in ('prepaid_package'::public.financial_plan_type, 'monthly'::public.financial_plan_type) then
    select o.timezone into org_timezone from public.organizations o where o.id = org_id;
    if org_timezone is null or btrim(org_timezone) = '' then
      raise exception 'organization timezone is not configured' using errcode = 'P0001';
    end if;
    charge_date := coalesce(p_valid_from, (now() at time zone org_timezone)::date);
    charge_origin := case when p_plan_type = 'monthly'::public.financial_plan_type
      then 'subscription'::public.financial_charge_origin else 'plan'::public.financial_charge_origin end;
    charge_description := case when p_plan_type = 'monthly'::public.financial_plan_type
      then 'Mensalidade' else 'Pacote pré-pago' end;
    insert into public.financial_charges (
      organization_id, patient_id, plan_id, origin, description, amount, due_date, competence_date, idempotency_key
    ) values (
      org_id, p_patient_id, new_plan_id, charge_origin, charge_description, p_price,
      charge_date, charge_date, coalesce(p_idempotency_key, gen_random_uuid()::text)
    );
  end if;
  return new_plan_id;
end;
$$;

revoke all on function public.create_financial_plan_with_initial_charge(
  uuid, uuid, public.financial_plan_type, integer, numeric, date, date, text
) from public;
grant execute on function public.create_financial_plan_with_initial_charge(
  uuid, uuid, public.financial_plan_type, integer, numeric, date, date, text
) to authenticated;
