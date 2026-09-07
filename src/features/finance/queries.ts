import "server-only";

import {
  amountCents,
  chargeRowSchema,
  closingRowSchema,
  expenseRowSchema,
  paymentRowSchema,
  planMovementRowSchema,
  planRowSchema,
  type ChargeRow,
  type ChargeView,
  type ClosingRow,
  type ExpenseRow,
  type FinanceSnapshot,
  type PaymentRow,
  type PlanMovementRow,
  type PlanRow,
  type SecretaryFinanceAccess,
} from "@/features/finance/contracts";
import { remainingCents } from "@/lib/finance/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrganizationRole } from "@/features/organizations/contracts";

function asAccess(value: unknown): SecretaryFinanceAccess {
  if (value === "view" || value === "manage" || value === "none") {
    return value;
  }
  return "none";
}

export async function getFinanceAccess(
  organizationId: string,
  role: OrganizationRole,
): Promise<SecretaryFinanceAccess> {
  if (role === "psychologist_admin") {
    return "manage";
  }
  if (role !== "secretary") {
    return "none";
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("secretary_finance_access", {
    org_id: organizationId,
  });
  if (error) {
    throw new Error(`failed to resolve finance access: ${error.message}`);
  }
  return asAccess(data);
}

export async function getSecretaryFinanceAccessSetting(
  organizationId: string,
): Promise<SecretaryFinanceAccess> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("practice_settings")
    .select("secretary_finance_access")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) {
    return "none";
  }
  return asAccess(
    (data as { secretary_finance_access: string }).secretary_finance_access,
  );
}

export async function listCharges(organizationId: string): Promise<ChargeRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges_effective")
    .select("*")
    .eq("organization_id", organizationId)
    .order("competence_date", { ascending: false });
  if (error) throw new Error(`failed to list charges: ${error.message}`);
  return chargeRowSchema.array().parse(data ?? []);
}

export async function listPayments(organizationId: string): Promise<PaymentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("paid_at", { ascending: false });
  if (error) throw new Error(`failed to list payments: ${error.message}`);
  return paymentRowSchema.array().parse(data ?? []);
}

export async function listExpenses(organizationId: string): Promise<ExpenseRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_expenses_effective")
    .select("*")
    .eq("organization_id", organizationId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`failed to list expenses: ${error.message}`);
  return expenseRowSchema.array().parse(data ?? []);
}

export async function listPlans(
  organizationId: string,
  patientId?: string,
): Promise<PlanRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("financial_plans")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (patientId) {
    query = query.eq("patient_id", patientId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`failed to list plans: ${error.message}`);
  return planRowSchema.array().parse(data ?? []);
}

export async function listPlanMovements(
  organizationId: string,
  planId: string,
): Promise<PlanMovementRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_plan_movements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`failed to list plan movements: ${error.message}`);
  return planMovementRowSchema.array().parse(data ?? []);
}

export async function listClosings(organizationId: string): Promise<ClosingRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_closings")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: false });
  if (error) throw new Error(`failed to list closings: ${error.message}`);
  return closingRowSchema.array().parse(data ?? []);
}

export function buildChargeViews(
  charges: ChargeRow[],
  payments: PaymentRow[],
  patientNames: Map<string, string>,
): ChargeView[] {
  const paidByCharge = new Map<string, number>();
  for (const payment of payments) {
    if (payment.voided_at) continue;
    paidByCharge.set(
      payment.charge_id,
      (paidByCharge.get(payment.charge_id) ?? 0) + amountCents(payment.amount),
    );
  }
  return charges.map((row) => {
    const amount = amountCents(row.amount);
    const paid = paidByCharge.get(row.id) ?? 0;
    return {
      row,
      amountCents: amount,
      paidCents: paid,
      remainingCents: remainingCents(amount, paid),
      patientName: row.patient_id ? (patientNames.get(row.patient_id) ?? null) : null,
    };
  });
}

export async function getFinanceSnapshot(
  organizationId: string,
  role: OrganizationRole,
  patientNames: Map<string, string>,
): Promise<FinanceSnapshot> {
  const access = await getFinanceAccess(organizationId, role);
  if (access === "none") {
    return {
      access,
      charges: [],
      payments: [],
      expenses: [],
      plans: [],
      closings: [],
      secretaryAccessSetting: "none",
    };
  }

  const [charges, payments, expenses, plans, closings, secretaryAccessSetting] =
    await Promise.all([
      listCharges(organizationId),
      listPayments(organizationId),
      listExpenses(organizationId),
      listPlans(organizationId),
      listClosings(organizationId),
      role === "psychologist_admin"
        ? getSecretaryFinanceAccessSetting(organizationId)
        : Promise.resolve(access),
    ]);

  return {
    access,
    charges: buildChargeViews(charges, payments, patientNames),
    payments,
    expenses,
    plans,
    closings,
    secretaryAccessSetting,
  };
}

export async function getPatientFinance(
  organizationId: string,
  role: OrganizationRole,
  patientId: string,
  patientName: string,
): Promise<{
  access: SecretaryFinanceAccess;
  charges: ChargeView[];
  payments: PaymentRow[];
  plans: PlanRow[];
}> {
  const access = await getFinanceAccess(organizationId, role);
  if (access === "none") {
    return { access, charges: [], payments: [], plans: [] };
  }
  const [charges, payments, plans] = await Promise.all([
    listCharges(organizationId),
    listPayments(organizationId),
    listPlans(organizationId, patientId),
  ]);
  const patientCharges = charges.filter((charge) => charge.patient_id === patientId);
  const chargeIds = new Set(patientCharges.map((charge) => charge.id));
  return {
    access,
    charges: buildChargeViews(patientCharges, payments, new Map([[patientId, patientName]])),
    payments: payments.filter((payment) => chargeIds.has(payment.charge_id)),
    plans,
  };
}
