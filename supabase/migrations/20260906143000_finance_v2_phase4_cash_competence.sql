-- VirgíniaPsi — Financeiro v2 / Fase 4.
-- Scope: explicit cash x competence semantics and cash-period locking.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_closing_scope') THEN
    CREATE TYPE public.financial_closing_scope AS ENUM ('competence', 'cash');
  END IF;
END
$$;

ALTER TABLE public.financial_closings
  ADD COLUMN IF NOT EXISTS scope public.financial_closing_scope NOT NULL DEFAULT 'competence';

ALTER TABLE public.financial_closings
  DROP CONSTRAINT IF EXISTS financial_closings_period_unique;

CREATE UNIQUE INDEX IF NOT EXISTS financial_closings_scope_period_unique
  ON public.financial_closings (organization_id, scope, period_start, period_end);

CREATE OR REPLACE FUNCTION public.finance_scope_period_is_closed(
  org_id uuid,
  fact_date date,
  p_scope public.financial_closing_scope
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.financial_closings c
    WHERE c.organization_id = org_id
      AND c.scope = p_scope
      AND c.status = 'closed'
      AND fact_date BETWEEN c.period_start AND c.period_end
  );
$$;

REVOKE ALL ON FUNCTION public.finance_scope_period_is_closed(uuid, date, public.financial_closing_scope) FROM public;
REVOKE ALL ON FUNCTION public.finance_scope_period_is_closed(uuid, date, public.financial_closing_scope) FROM anon;
REVOKE ALL ON FUNCTION public.finance_scope_period_is_closed(uuid, date, public.financial_closing_scope) FROM authenticated;

-- Compatibility: existing callers mean competence when no scope is specified.
CREATE OR REPLACE FUNCTION public.finance_period_is_closed(org_id uuid, competence date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.finance_scope_period_is_closed(
    org_id,
    competence,
    'competence'::public.financial_closing_scope
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_finance_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  fact_date date;
  org uuid;
  org_timezone text;
  p_scope public.financial_closing_scope;
  derived_status_only boolean := false;
BEGIN
  org := coalesce(new.organization_id, old.organization_id);

  IF tg_table_name = 'financial_charges' THEN
    p_scope := 'competence';
    fact_date := coalesce(new.competence_date, old.competence_date);

    IF tg_op = 'UPDATE' THEN
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
      IF derived_status_only THEN RETURN new; END IF;
    END IF;
  ELSIF tg_table_name = 'financial_payments' THEN
    p_scope := 'cash';
    SELECT o.timezone INTO org_timezone FROM public.organizations o WHERE o.id = org;
    IF org_timezone IS NULL OR btrim(org_timezone) = '' THEN
      RAISE EXCEPTION 'organization timezone is not configured' USING errcode = 'P0001';
    END IF;
    fact_date := (coalesce(new.paid_at, old.paid_at) AT TIME ZONE org_timezone)::date;
  ELSIF tg_table_name = 'financial_expenses' THEN
    p_scope := 'competence';
    fact_date := coalesce(new.due_date, old.due_date, current_date);
  ELSE
    RETURN new;
  END IF;

  IF fact_date IS NOT NULL
     AND public.finance_scope_period_is_closed(org, fact_date, p_scope) THEN
    IF p_scope = 'cash' THEN
      RAISE EXCEPTION 'financial cash period is closed for this payment date' USING errcode = 'P0001';
    ELSE
      RAISE EXCEPTION 'financial competence period is closed for this date' USING errcode = 'P0001';
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS financial_payments_period_lock ON public.financial_payments;
CREATE TRIGGER financial_payments_period_lock
  BEFORE INSERT OR UPDATE ON public.financial_payments
  FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open();

REVOKE ALL ON FUNCTION public.assert_finance_period_open() FROM public;
REVOKE ALL ON FUNCTION public.assert_finance_period_open() FROM anon;
REVOKE ALL ON FUNCTION public.assert_finance_period_open() FROM authenticated;
