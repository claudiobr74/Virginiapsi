-- VirgíniaPsi — Financeiro v2 / Fase 3.
-- Scope only: package billing cycles, monthly subscriptions and recurring expenses.
-- Cash x competence remains deliberately deferred to F4.

-- ---------------------------------------------------------------------------
-- Recurring expense identity.
-- The first expense is the series root. Generated occurrences reuse its
-- recurrence_series_key and receive a unique occurrence date.
-- ---------------------------------------------------------------------------

alter table public.financial_expenses
  add column if not exists recurrence_series_key text,
  add column if not exists recurrence_occurrence_date date;

create unique index if not exists financial_expenses_recurrence_occurrence_unique
  on public.financial_expenses (organization_id, recurrence_series_key, recurrence_occurrence_date)
  where recurrence_series_key is not null and recurrence_occurrence_date is not null;

create or replace function public.assert_financial_expense_recurrence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recurrence ->> 'interval' = 'monthly' then
    if new.due_date is null then
      raise exception 'monthly recurring expense requires due date' using errcode = '23514';
    end if;
    new.recurrence_series_key := coalesce(nullif(btrim(new.recurrence_series_key), ''), new.id::text);
    new.recurrence_occurrence_date := coalesce(new.recurrence_occurrence_date, new.due_date);
  end if;
  return new;
end;
$$;

revoke all on function public.assert_financial_expense_recurrence() from public;
revoke all on function public.assert_financial_expense_recurrence() from anon;
revoke all on function public.assert_financial_expense_recurrence() from authenticated;

drop trigger if exists financial_expenses_assert_recurrence on public.financial_expenses;
create trigger financial_expenses_assert_recurrence
  before insert or update of recurrence, due_date, recurrence_series_key, recurrence_occurrence_date
  on public.financial_expenses
  for each row execute function public.assert_financial_expense_recurrence();

-- Backfill existing monthly recurrence markers created before F3. These rows
-- become roots without creating any financial fact retroactively by migration.
update public.financial_expenses
set recurrence_series_key = id::text,
    recurrence_occurrence_date = due_date
where recurrence ->> 'interval' = 'monthly'
  and due_date is not null
  and recurrence_series_key is null;

-- ---------------------------------------------------------------------------
-- Postpaid package: consume sessions normally; when the fixed package becomes
-- exhausted, create exactly one consolidated charge for the package price.
-- ---------------------------------------------------------------------------

create unique index if not exists financial_charges_plan_single_charge_unique
  on public.financial_charges (plan_id)
  where plan_id is not null and origin = 'plan';

create unique index if not exists financial_charges_subscription_cycle_unique
  on public.financial_charges (plan_id, competence_date)
  where plan_id is not null and origin = 'subscription';

create or replace function public.refresh_plan_used_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  used integer;
  total integer;
  until_date date;
  next_status public.financial_plan_status;
  current_status public.financial_plan_status;
  kind public.financial_plan_type;
  plan_price numeric(12, 2);
  plan_patient uuid;
  plan_org uuid;
  org_timezone text;
  billing_date date;
begin
  target := coalesce(new.plan_id, old.plan_id);

  select coalesce(sum(delta), 0) into used
  from public.financial_plan_movements
  where plan_id = target;

  select total_sessions, valid_until, status, plan_type, price, patient_id, organization_id
    into total, until_date, current_status, kind, plan_price, plan_patient, plan_org
  from public.financial_plans
  where id = target;

  if current_status = 'canceled' then
    next_status := 'canceled';
  elsif until_date is not null and until_date < current_date then
    next_status := 'expired';
  elsif total is not null and used >= total then
    next_status := 'exhausted';
  else
    next_status := 'active';
  end if;

  update public.financial_plans
  set used_sessions = used, status = next_status
  where id = target;

  if tg_op = 'INSERT'
     and new.movement = 'consume'
     and kind = 'postpaid_package'
     and next_status = 'exhausted' then
    select o.timezone into org_timezone
    from public.organizations o
    where o.id = plan_org;
    billing_date := (now() at time zone coalesce(nullif(btrim(org_timezone), ''), 'America/Sao_Paulo'))::date;

    insert into public.financial_charges (
      organization_id, patient_id, plan_id, origin, description,
      amount, due_date, competence_date, idempotency_key
    ) values (
      plan_org, plan_patient, target, 'plan', 'Pacote pós-pago',
      plan_price, billing_date, billing_date, 'postpaid-plan:' || target::text
    )
    on conflict (plan_id) where plan_id is not null and origin = 'plan' do nothing;
  end if;

  return coalesce(new, old);
end;
$$;

-- Internal trigger function only; never expose as an RPC endpoint.
revoke all on function public.refresh_plan_used_sessions() from public;
revoke all on function public.refresh_plan_used_sessions() from anon;
revoke all on function public.refresh_plan_used_sessions() from authenticated;

-- ---------------------------------------------------------------------------
-- Monthly materialization.
-- Runs without user interaction. For monthly plans it creates one subscription
-- charge per anniversary date. For recurring expenses it creates one expense
-- occurrence per monthly anniversary. Unique indexes make the operation safe to
-- retry. Closed periods remain immutable and are deliberately skipped.
-- ---------------------------------------------------------------------------

create or replace function public.materialize_finance_recurring_items(
  p_through_date date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  org record;
  plan record;
  root_expense record;
  org_today date;
  anchor date;
  anchor_day integer;
  month_cursor date;
  month_end date;
  occurrence_date date;
  generated_charges integer := 0;
  generated_expenses integer := 0;
begin
  for org in
    select id, coalesce(nullif(btrim(timezone), ''), 'America/Sao_Paulo') as timezone
    from public.organizations
  loop
    org_today := coalesce(p_through_date, (now() at time zone org.timezone)::date);

    for plan in
      select p.*
      from public.financial_plans p
      where p.organization_id = org.id
        and p.plan_type = 'monthly'
        and p.status = 'active'
    loop
      anchor := coalesce(plan.valid_from, (plan.created_at at time zone org.timezone)::date);
      anchor_day := extract(day from anchor)::integer;
      month_cursor := date_trunc('month', anchor)::date;

      while month_cursor <= date_trunc('month', org_today)::date loop
        month_end := (month_cursor + interval '1 month - 1 day')::date;
        occurrence_date := month_cursor + (least(anchor_day, extract(day from month_end)::integer) - 1);

        if occurrence_date >= anchor
           and occurrence_date <= org_today
           and (plan.valid_until is null or occurrence_date <= plan.valid_until)
           and not public.finance_period_is_closed(org.id, occurrence_date) then
          insert into public.financial_charges (
            organization_id, patient_id, plan_id, origin, description,
            amount, due_date, competence_date, idempotency_key
          ) values (
            org.id, plan.patient_id, plan.id, 'subscription', 'Mensalidade',
            plan.price, occurrence_date, occurrence_date,
            'monthly-plan:' || plan.id::text || ':' || occurrence_date::text
          )
          on conflict (plan_id, competence_date)
            where plan_id is not null and origin = 'subscription'
          do nothing;

          if found then
            generated_charges := generated_charges + 1;
          end if;
        end if;

        month_cursor := (month_cursor + interval '1 month')::date;
      end loop;
    end loop;

    for root_expense in
      select e.*
      from public.financial_expenses e
      where e.organization_id = org.id
        and e.recurrence ->> 'interval' = 'monthly'
        and e.recurrence_series_key = e.id::text
        and e.status <> 'canceled'
        and e.due_date is not null
    loop
      anchor := root_expense.due_date;
      anchor_day := extract(day from anchor)::integer;
      month_cursor := (date_trunc('month', anchor)::date + interval '1 month')::date;

      while month_cursor <= date_trunc('month', org_today)::date loop
        month_end := (month_cursor + interval '1 month - 1 day')::date;
        occurrence_date := month_cursor + (least(anchor_day, extract(day from month_end)::integer) - 1);

        if occurrence_date <= org_today
           and not public.finance_period_is_closed(org.id, occurrence_date) then
          insert into public.financial_expenses (
            organization_id, category, supplier, description, amount, due_date,
            recurrence, recurrence_series_key, recurrence_occurrence_date
          ) values (
            org.id,
            root_expense.category,
            root_expense.supplier,
            root_expense.description,
            root_expense.amount,
            occurrence_date,
            coalesce(root_expense.recurrence, '{}'::jsonb) || jsonb_build_object('generated', true),
            root_expense.recurrence_series_key,
            occurrence_date
          )
          on conflict (organization_id, recurrence_series_key, recurrence_occurrence_date)
            where recurrence_series_key is not null and recurrence_occurrence_date is not null
          do nothing;

          if found then
            generated_expenses := generated_expenses + 1;
          end if;
        end if;

        month_cursor := (month_cursor + interval '1 month')::date;
      end loop;
    end loop;
  end loop;

  return jsonb_build_object(
    'generated_charges', generated_charges,
    'generated_expenses', generated_expenses
  );
end;
$$;

revoke all on function public.materialize_finance_recurring_items(date) from public;
revoke all on function public.materialize_finance_recurring_items(date) from anon;
revoke all on function public.materialize_finance_recurring_items(date) from authenticated;
grant execute on function public.materialize_finance_recurring_items(date) to service_role;

-- Hosted Supabase has pg_cron. Local CI databases may not, so scheduling is
-- conditional and the migration remains portable. 03:15 UTC = 00:15 in
-- America/Sao_Paulo during the current Brazilian timezone rules.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'virginiapsi-finance-recurring-daily'
    ) then
      perform cron.schedule(
        'virginiapsi-finance-recurring-daily',
        '15 3 * * *',
        'select public.materialize_finance_recurring_items(null);'
      );
    end if;
  end if;
end;
$$;
