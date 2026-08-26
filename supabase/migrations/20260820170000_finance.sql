-- Tesseli — Phase 10: Financeiro.
-- Specs: docs/04-data-model.md §Financeiro, docs/05-security-rbac-rls.md
-- (secretary_finance_access none/view/manage), prompts/10-finance.md.
--
-- Values are numeric(12,2). No table in this migration grants DELETE to
-- authenticated — void/cancel/refund are named states. Charge status is
-- derived from non-voided payments by trigger. A closed period blocks
-- INSERT/UPDATE of facts whose competence_date falls inside it.

create type public.financial_charge_origin as enum (
  'session', 'plan', 'subscription', 'administrative'
);

create type public.financial_charge_status as enum (
  'pending', 'partially_paid', 'paid', 'overdue', 'canceled', 'refunded'
);

create type public.financial_payment_method as enum (
  'pix', 'cash', 'card', 'transfer', 'courtesy', 'other'
);

create type public.financial_expense_status as enum (
  'pending', 'paid', 'overdue', 'canceled'
);

create type public.financial_plan_type as enum (
  'prepaid_package', 'postpaid_package', 'monthly'
);

create type public.financial_plan_status as enum (
  'active', 'exhausted', 'expired', 'canceled'
);

create type public.financial_plan_movement as enum (
  'consume', 'restore', 'adjust', 'renew'
);

create type public.financial_closing_status as enum ('open', 'closed');

-- ---------------------------------------------------------------------------
-- Permission helpers (docs/05). secretary_finance_access() already returns
-- 'manage' for psychologist_admin, so these cover both roles.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_finance(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.secretary_finance_access(org_id) in (
    'view'::public.secretary_finance_access,
    'manage'::public.secretary_finance_access
  );
$$;

create or replace function public.can_write_finance(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.secretary_finance_access(org_id) = 'manage'::public.secretary_finance_access;
$$;

revoke all on function public.can_read_finance(uuid) from public;
revoke all on function public.can_write_finance(uuid) from public;
grant execute on function public.can_read_finance(uuid) to authenticated;
grant execute on function public.can_write_finance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- financial_plans (referenced by charges)
-- ---------------------------------------------------------------------------

create table public.financial_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  plan_type public.financial_plan_type not null,
  total_sessions integer check (total_sessions is null or total_sessions > 0),
  used_sessions integer not null default 0 check (used_sessions >= 0),
  price numeric(12, 2) not null check (price >= 0),
  valid_from date,
  valid_until date,
  status public.financial_plan_status not null default 'active',
  canceled_at timestamptz,
  canceled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_plans_validity check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  ),
  constraint financial_plans_used_within_total check (
    total_sessions is null or used_sessions <= total_sessions
  )
);

create index financial_plans_patient_idx on public.financial_plans (patient_id, status);

create trigger financial_plans_set_updated_at
  before update on public.financial_plans
  for each row execute function public.set_updated_at();

create or replace function public.assert_financial_plan_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
begin
  select organization_id into patient_org from public.patients where id = new.patient_id;
  if patient_org is null or patient_org <> new.organization_id then
    raise exception 'financial plan patient must belong to the same organization'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.patient_id := old.patient_id;
  end if;
  return new;
end;
$$;

create trigger financial_plans_assert_consistency
  before insert or update on public.financial_plans
  for each row execute function public.assert_financial_plan_consistency();

-- ---------------------------------------------------------------------------
-- financial_charges
-- ---------------------------------------------------------------------------

create table public.financial_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  session_id uuid references public.clinical_sessions (id) on delete set null,
  plan_id uuid references public.financial_plans (id) on delete set null,
  origin public.financial_charge_origin not null,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  amount numeric(12, 2) not null check (amount >= 0),
  due_date date,
  competence_date date not null,
  status public.financial_charge_status not null default 'pending',
  canceled_at timestamptz,
  canceled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  nfse_requested_at timestamptz,
  idempotency_key text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_charges_session_unique unique (organization_id, session_id),
  constraint financial_charges_idempotency_unique unique (organization_id, idempotency_key),
  constraint financial_charges_canceled_has_timestamp check (
    status <> 'canceled' or canceled_at is not null
  )
);

create unique index financial_charges_session_unique_not_null
  on public.financial_charges (organization_id, session_id)
  where session_id is not null;

-- Drop the unconstrained unique that would treat multiple NULLs as conflict
-- on some Postgres versions; the partial index above is the real rule.
alter table public.financial_charges drop constraint financial_charges_session_unique;

create unique index financial_charges_idempotency_unique_not_null
  on public.financial_charges (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.financial_charges drop constraint financial_charges_idempotency_unique;

create index financial_charges_org_due_idx
  on public.financial_charges (organization_id, due_date, status);
create index financial_charges_patient_idx
  on public.financial_charges (patient_id)
  where patient_id is not null;

create trigger financial_charges_set_updated_at
  before update on public.financial_charges
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_payments
-- ---------------------------------------------------------------------------

create table public.financial_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  charge_id uuid not null references public.financial_charges (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method public.financial_payment_method not null,
  notes text,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  registered_by uuid references auth.users (id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index financial_payments_idempotency_unique_not_null
  on public.financial_payments (organization_id, idempotency_key)
  where idempotency_key is not null;

create index financial_payments_charge_idx on public.financial_payments (charge_id);

create trigger financial_payments_set_updated_at
  before update on public.financial_payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_expenses
-- ---------------------------------------------------------------------------

create table public.financial_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category text not null check (char_length(btrim(category)) between 1 and 80),
  supplier text,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  amount numeric(12, 2) not null check (amount >= 0),
  due_date date,
  paid_at timestamptz,
  recurrence jsonb,
  attachment_document_id uuid references public.documents (id) on delete set null,
  status public.financial_expense_status not null default 'pending',
  canceled_at timestamptz,
  canceled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_expenses_org_idx
  on public.financial_expenses (organization_id, due_date, status);

create trigger financial_expenses_set_updated_at
  before update on public.financial_expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- financial_plan_movements
-- ---------------------------------------------------------------------------

create table public.financial_plan_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.financial_plans (id) on delete cascade,
  session_id uuid references public.clinical_sessions (id) on delete set null,
  movement public.financial_plan_movement not null,
  delta integer not null,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_plan_movements_adjust_reason check (
    movement <> 'adjust' or char_length(btrim(coalesce(reason, ''))) > 0
  )
);

create unique index financial_plan_movements_consume_session_unique
  on public.financial_plan_movements (plan_id, session_id)
  where session_id is not null and movement = 'consume';

-- ---------------------------------------------------------------------------
-- financial_closings
-- ---------------------------------------------------------------------------

create table public.financial_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.financial_closing_status not null default 'closed',
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users (id) on delete set null,
  totals_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_closings_period check (period_end >= period_start),
  constraint financial_closings_period_unique unique (organization_id, period_start, period_end)
);

create trigger financial_closings_set_updated_at
  before update on public.financial_closings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Closed-period lock + charge consistency
-- ---------------------------------------------------------------------------

create or replace function public.finance_period_is_closed(org_id uuid, competence date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.financial_closings c
    where c.organization_id = org_id
      and c.status = 'closed'
      and competence between c.period_start and c.period_end
  );
$$;

revoke all on function public.finance_period_is_closed(uuid, date) from public;
grant execute on function public.finance_period_is_closed(uuid, date) to authenticated;

create or replace function public.assert_finance_period_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  competence date;
  org uuid;
begin
  org := coalesce(new.organization_id, old.organization_id);
  if tg_table_name = 'financial_charges' then
    competence := coalesce(new.competence_date, old.competence_date);
  elsif tg_table_name = 'financial_payments' then
    select competence_date into competence
    from public.financial_charges
    where id = coalesce(new.charge_id, old.charge_id);
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

create trigger financial_charges_period_lock
  before insert or update on public.financial_charges
  for each row execute function public.assert_finance_period_open();

create trigger financial_payments_period_lock
  before insert or update on public.financial_payments
  for each row execute function public.assert_finance_period_open();

create trigger financial_expenses_period_lock
  before insert or update on public.financial_expenses
  for each row execute function public.assert_finance_period_open();

create or replace function public.assert_financial_charge_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  patient_org uuid;
  session_org uuid;
begin
  if new.patient_id is not null then
    select organization_id into patient_org from public.patients where id = new.patient_id;
    if patient_org is null or patient_org <> new.organization_id then
      raise exception 'financial charge patient must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;
  if new.session_id is not null then
    select organization_id into session_org from public.clinical_sessions where id = new.session_id;
    if session_org is null or session_org <> new.organization_id then
      raise exception 'financial charge session must belong to the same organization'
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.due_date is not null and new.due_date < current_date and new.status = 'pending' then
      new.status := 'overdue';
    end if;
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.session_id := old.session_id;
    new.origin := old.origin;
    new.created_by := old.created_by;
    if new.status in ('canceled', 'refunded') and old.status not in ('canceled', 'refunded') then
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_charges_assert_consistency
  before insert or update on public.financial_charges
  for each row execute function public.assert_financial_charge_consistency();

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
begin
  select * into charge from public.financial_charges where id = new.charge_id;
  if not found then
    return new;
  end if;
  if charge.status in ('canceled', 'refunded') then
    return new;
  end if;

  select coalesce(sum(amount), 0) into paid
  from public.financial_payments
  where charge_id = charge.id and voided_at is null;

  if paid >= charge.amount and charge.amount > 0 then
    next_status := 'paid';
  elsif paid > 0 then
    next_status := 'partially_paid';
  elsif charge.due_date is not null and charge.due_date < current_date then
    next_status := 'overdue';
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

create trigger financial_payments_refresh_charge
  after insert or update on public.financial_payments
  for each row execute function public.refresh_charge_status();

create or replace function public.assert_financial_payment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge_org uuid;
  charge_status public.financial_charge_status;
  charge_amount numeric(12, 2);
  already_paid numeric(12, 2);
begin
  select organization_id, status, amount
    into charge_org, charge_status, charge_amount
  from public.financial_charges
  where id = new.charge_id;

  if charge_org is null or charge_org <> new.organization_id then
    raise exception 'financial payment charge must belong to the same organization'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.registered_by := auth.uid();
    if charge_status in ('canceled', 'refunded') then
      raise exception 'cannot pay a canceled or refunded charge'
        using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0) into already_paid
    from public.financial_payments
    where charge_id = new.charge_id and voided_at is null;
    if already_paid + new.amount > charge_amount then
      raise exception 'payment exceeds remaining charge amount'
        using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.charge_id := old.charge_id;
    new.amount := old.amount;
    new.registered_by := old.registered_by;
    if new.voided_at is not null and old.voided_at is null then
      new.voided_by := coalesce(new.voided_by, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_payments_assert_consistency
  before insert or update on public.financial_payments
  for each row execute function public.assert_financial_payment_consistency();

create or replace function public.assert_financial_expense_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.due_date is not null and new.due_date < current_date and new.status = 'pending' then
      new.status := 'overdue';
    end if;
  elsif tg_op = 'UPDATE' then
    new.organization_id := old.organization_id;
    new.created_by := old.created_by;
    if new.status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    end if;
    if new.status = 'canceled' and old.status <> 'canceled' then
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_expenses_assert_consistency
  before insert or update on public.financial_expenses
  for each row execute function public.assert_financial_expense_consistency();

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
begin
  target := coalesce(new.plan_id, old.plan_id);
  select coalesce(sum(delta), 0) into used
  from public.financial_plan_movements
  where plan_id = target;

  select total_sessions, valid_until, status
    into total, until_date, current_status
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
  return coalesce(new, old);
end;
$$;

create trigger financial_plan_movements_refresh_plan
  after insert on public.financial_plan_movements
  for each row execute function public.refresh_plan_used_sessions();

create or replace function public.assert_financial_plan_movement_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_org uuid;
  plan_status public.financial_plan_status;
  used integer;
  total integer;
begin
  select organization_id, status, used_sessions, total_sessions
    into plan_org, plan_status, used, total
  from public.financial_plans
  where id = new.plan_id;
  if plan_org is null or plan_org <> new.organization_id then
    raise exception 'financial plan movement must belong to the same organization'
      using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  if new.movement = 'consume' then
    if plan_status <> 'active' then
      raise exception 'cannot consume a plan that is not active'
        using errcode = 'P0001';
    end if;
    if new.delta <= 0 then
      raise exception 'consume delta must be positive' using errcode = '23514';
    end if;
    if total is not null and used + new.delta > total then
      raise exception 'plan has no remaining sessions' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_plan_movements_assert_consistency
  before insert on public.financial_plan_movements
  for each row execute function public.assert_financial_plan_movement_consistency();

-- ---------------------------------------------------------------------------
-- Session finalization → charge (idempotent via unique session_id)
-- ---------------------------------------------------------------------------

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

  competence := (sess.started_at at time zone 'UTC')::date;

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

-- ---------------------------------------------------------------------------
-- Grants + RLS. No DELETE on any financial fact table.
-- ---------------------------------------------------------------------------

grant select, insert, update on public.financial_charges to authenticated;
grant select, insert, update on public.financial_payments to authenticated;
grant select, insert, update on public.financial_expenses to authenticated;
grant select, insert, update on public.financial_plans to authenticated;
grant select, insert on public.financial_plan_movements to authenticated;
grant select, insert, update on public.financial_closings to authenticated;

alter table public.financial_charges enable row level security;
alter table public.financial_payments enable row level security;
alter table public.financial_expenses enable row level security;
alter table public.financial_plans enable row level security;
alter table public.financial_plan_movements enable row level security;
alter table public.financial_closings enable row level security;

create policy financial_charges_select on public.financial_charges
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_charges_insert on public.financial_charges
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_charges_update on public.financial_charges
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_payments_select on public.financial_payments
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_payments_insert on public.financial_payments
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_payments_update on public.financial_payments
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_expenses_select on public.financial_expenses
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_expenses_insert on public.financial_expenses
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_expenses_update on public.financial_expenses
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_plans_select on public.financial_plans
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_plans_insert on public.financial_plans
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_plans_update on public.financial_plans
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));

create policy financial_plan_movements_select on public.financial_plan_movements
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_plan_movements_insert on public.financial_plan_movements
  for insert to authenticated with check (public.can_write_finance(organization_id));

create policy financial_closings_select on public.financial_closings
  for select to authenticated using (public.can_read_finance(organization_id));
create policy financial_closings_insert on public.financial_closings
  for insert to authenticated with check (public.can_write_finance(organization_id));
create policy financial_closings_update on public.financial_closings
  for update to authenticated
  using (public.can_write_finance(organization_id))
  with check (public.can_write_finance(organization_id));
