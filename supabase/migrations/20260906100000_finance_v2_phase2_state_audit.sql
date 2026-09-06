-- VirgíniaPsi — Financeiro v2 / Fase 2.
-- One database-derived source of truth for overdue state and auditable reopen reasons.

alter table public.financial_closings
  add column if not exists reopen_reason text;

-- New reopen operations must carry the real operator reason. Historical rows are
-- left compatible; the rule is enforced only on a closed -> open transition.
create or replace function public.assert_financial_closing_reopen_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'closed' and new.status = 'open' then
      if char_length(btrim(coalesce(new.reopen_reason, ''))) < 3 then
        raise exception 'reopen reason is required' using errcode = '23514';
      end if;
      if char_length(btrim(new.reopen_reason)) > 300 then
        raise exception 'reopen reason is too long' using errcode = '23514';
      end if;
      new.reopened_at := coalesce(new.reopened_at, now());
      new.reopened_by := coalesce(new.reopened_by, auth.uid());
      new.reopen_reason := btrim(new.reopen_reason);
    elsif old.status = 'open' and new.status = 'closed' then
      new.reopened_at := null;
      new.reopened_by := null;
      new.reopen_reason := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_closings_assert_reopen_reason on public.financial_closings;
create trigger financial_closings_assert_reopen_reason
  before update on public.financial_closings
  for each row execute function public.assert_financial_closing_reopen_reason();

-- Keep persisted charge status aligned whenever a payment changes. Overdue has
-- precedence over partially-paid while there is still an unpaid balance, so a
-- charge has one unambiguous operational state.
create or replace function public.refresh_charge_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge public.financial_charges%rowtype;
  paid numeric(12, 2);
  next_status public.financial_charge_status;
  org_timezone text;
  org_today date;
begin
  select * into charge from public.financial_charges where id = new.charge_id;
  if not found then
    return new;
  end if;
  if charge.status in ('canceled', 'refunded') then
    return new;
  end if;

  select o.timezone into org_timezone
  from public.organizations o
  where o.id = charge.organization_id;
  org_today := (now() at time zone coalesce(nullif(btrim(org_timezone), ''), 'America/Sao_Paulo'))::date;

  select coalesce(sum(amount), 0) into paid
  from public.financial_payments
  where charge_id = charge.id and voided_at is null;

  if paid >= charge.amount and charge.amount > 0 then
    next_status := 'paid';
  elsif charge.due_date is not null and charge.due_date < org_today and paid < charge.amount then
    next_status := 'overdue';
  elsif paid > 0 then
    next_status := 'partially_paid';
  else
    next_status := 'pending';
  end if;

  if charge.status is distinct from next_status then
    update public.financial_charges
    set status = next_status
    where id = charge.id;
  end if;
  return new;
end;
$$;

-- Read models are the source of truth for time-dependent status. They avoid
-- mutating financial facts merely because a page was opened and work for both
-- manage and view-only finance access through the base-table RLS policies.
create or replace view public.financial_charges_effective
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.patient_id,
  c.session_id,
  c.plan_id,
  c.origin,
  c.description,
  c.amount,
  c.due_date,
  c.competence_date,
  case
    when c.status in ('canceled', 'refunded') then c.status
    when coalesce(p.paid_amount, 0) >= c.amount and c.amount > 0 then 'paid'::public.financial_charge_status
    when c.due_date is not null
      and c.due_date < (now() at time zone coalesce(nullif(btrim(o.timezone), ''), 'America/Sao_Paulo'))::date
      and coalesce(p.paid_amount, 0) < c.amount
      then 'overdue'::public.financial_charge_status
    when coalesce(p.paid_amount, 0) > 0 then 'partially_paid'::public.financial_charge_status
    else 'pending'::public.financial_charge_status
  end as status,
  c.canceled_at,
  c.canceled_by,
  c.cancel_reason,
  c.nfse_requested_at,
  c.idempotency_key,
  c.created_by,
  c.created_at,
  c.updated_at
from public.financial_charges c
join public.organizations o on o.id = c.organization_id
left join lateral (
  select coalesce(sum(fp.amount), 0)::numeric(12, 2) as paid_amount
  from public.financial_payments fp
  where fp.charge_id = c.id and fp.voided_at is null
) p on true;

revoke all on public.financial_charges_effective from public;
revoke all on public.financial_charges_effective from anon;
grant select on public.financial_charges_effective to authenticated;

create or replace view public.financial_expenses_effective
with (security_invoker = true)
as
select
  e.id,
  e.organization_id,
  e.category,
  e.supplier,
  e.description,
  e.amount,
  e.due_date,
  e.paid_at,
  e.recurrence,
  e.attachment_document_id,
  case
    when e.status in ('paid', 'canceled') then e.status
    when e.due_date is not null
      and e.due_date < (now() at time zone coalesce(nullif(btrim(o.timezone), ''), 'America/Sao_Paulo'))::date
      then 'overdue'::public.financial_expense_status
    else 'pending'::public.financial_expense_status
  end as status,
  e.canceled_at,
  e.canceled_by,
  e.cancel_reason,
  e.created_by,
  e.created_at,
  e.updated_at
from public.financial_expenses e
join public.organizations o on o.id = e.organization_id;

revoke all on public.financial_expenses_effective from public;
revoke all on public.financial_expenses_effective from anon;
grant select on public.financial_expenses_effective to authenticated;
