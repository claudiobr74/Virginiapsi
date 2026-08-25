"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  adjustPlanSchema,
  amountCents,
  cancelChargeSchema,
  closePeriodSchema,
  createChargeSchema,
  createExpenseSchema,
  createPlanSchema,
  exportCsvSchema,
  monthBounds,
  registerPaymentSchema,
  todayIsoDate,
  updateSecretaryAccessSchema,
  voidPaymentSchema,
} from "@/features/finance/contracts";
import { buildFinanceCsv } from "@/features/finance/csv";
import { buildChargeViews, getFinanceAccess, listCharges, listExpenses, listPayments } from "@/features/finance/queries";
import { generateDocumentPdf } from "@/lib/documents/generate-pdf";
import {
  DOCUMENT_BUCKETS,
  buildStoragePath,
  sha256Hex,
  uploadGeneratedFile,
} from "@/lib/documents/storage";
import { PAYMENT_METHOD_LABELS } from "@/features/finance/contracts";
import { formatBRL, formatCents } from "@/lib/finance/money";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPatients } from "@/features/patients/queries";

export interface FinanceActionResult {
  error?: string;
  id?: string | null;
  csv?: string;
  warning?: string;
}

function mapFinanceError(message: string): string {
  if (/period is closed/i.test(message)) {
    return "Este período financeiro está fechado.";
  }
  if (/exceeds remaining/i.test(message)) {
    return "O pagamento ultrapassa o saldo desta cobrança.";
  }
  if (/not authorized to write finance/i.test(message)) {
    return "Sem permissão para alterar o financeiro.";
  }
  if (/duplicate key|unique/i.test(message)) {
    return "Este lançamento já existe (idempotência).";
  }
  if (/row-level security/i.test(message)) {
    return "Sem permissão para esta operação financeira.";
  }
  if (/no remaining sessions/i.test(message)) {
    return "O plano não tem sessões restantes.";
  }
  if (/cannot consume/i.test(message)) {
    return "Não é possível consumir um plano inativo.";
  }
  if (/cannot pay a canceled/i.test(message)) {
    return "Não é possível pagar uma cobrança cancelada ou estornada.";
  }
  return "Não foi possível concluir a operação financeira agora.";
}

async function requireWriteAccess() {
  const ctx = await requireOrgContext();
  const access = await getFinanceAccess(ctx.organizationId, ctx.role);
  if (access !== "manage") {
    return { ctx, error: "Sem permissão para alterar o financeiro." as const };
  }
  return { ctx, error: undefined };
}

function revalidateFinance(patientId?: string | null) {
  revalidatePath("/app/finance");
  revalidatePath("/app");
  if (patientId) {
    revalidatePath(`/app/patients/${patientId}`);
  }
}

export async function createChargeAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = createChargeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .insert({
      organization_id: ctx.organizationId,
      patient_id: parsed.data.patientId || null,
      origin: parsed.data.origin,
      description: parsed.data.description,
      amount: parsed.data.amount,
      due_date: parsed.data.dueDate ?? null,
      competence_date: parsed.data.competenceDate,
      idempotency_key: parsed.data.idempotencyKey ?? randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "") };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.charge.create",
    resourceType: "financial_charge",
    resourceId: data.id,
  });
  revalidateFinance(parsed.data.patientId || null);
  return { id: data.id };
}

export async function registerPaymentAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = registerPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: charge, error: chargeError } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("id", parsed.data.chargeId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (chargeError || !charge) {
    return { error: "Cobrança não encontrada." };
  }

  const { data, error } = await supabase
    .from("financial_payments")
    .insert({
      organization_id: ctx.organizationId,
      charge_id: parsed.data.chargeId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      notes: parsed.data.notes || null,
      paid_at: parsed.data.paidAt ? new Date(`${parsed.data.paidAt}T12:00:00`).toISOString() : new Date().toISOString(),
      idempotency_key: parsed.data.idempotencyKey ?? randomUUID(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "") };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.payment.register",
    resourceType: "financial_payment",
    resourceId: data.id,
  });
  revalidateFinance(charge.patient_id as string | null);
  return { id: data.id };
}

export async function voidPaymentAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_payments")
    .update({
      voided_at: new Date().toISOString(),
      void_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.paymentId)
    .eq("organization_id", ctx.organizationId)
    .is("voided_at", null)
    .select("id, charge_id")
    .maybeSingle();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "Pagamento não encontrado.") };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.payment.void",
    resourceType: "financial_payment",
    resourceId: data.id,
  });
  revalidateFinance();
  return { id: data.id };
}

export async function cancelChargeAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = cancelChargeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const status = parsed.data.asRefund ? "refunded" : "canceled";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .update({
      status,
      cancel_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.chargeId)
    .eq("organization_id", ctx.organizationId)
    .select("id, patient_id")
    .maybeSingle();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "Cobrança não encontrada.") };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: parsed.data.asRefund ? "finance.charge.refund" : "finance.charge.cancel",
    resourceType: "financial_charge",
    resourceId: data.id,
  });
  revalidateFinance(data.patient_id as string | null);
  return { id: data.id };
}

export async function requestNfseAction(chargeId: string): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_charges")
    .update({ nfse_requested_at: new Date().toISOString() })
    .eq("id", chargeId)
    .eq("organization_id", ctx.organizationId)
    .select("id, patient_id")
    .maybeSingle();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "Cobrança não encontrada.") };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.nfse.request",
    resourceType: "financial_charge",
    resourceId: data.id,
  });
  revalidateFinance(data.patient_id as string | null);
  return { id: data.id };
}

export async function createExpenseAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_expenses")
    .insert({
      organization_id: ctx.organizationId,
      category: parsed.data.category,
      supplier: parsed.data.supplier || null,
      description: parsed.data.description,
      amount: parsed.data.amount,
      due_date: parsed.data.dueDate ?? null,
      recurrence: parsed.data.recurringMonthly ? { interval: "monthly" } : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "") };
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.expense.create",
    resourceType: "financial_expense",
    resourceId: data.id,
  });
  revalidateFinance();
  return { id: data.id };
}

export async function payExpenseAction(expenseId: string): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_expenses")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", expenseId)
    .eq("organization_id", ctx.organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "Despesa não encontrada.") };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.expense.pay",
    resourceType: "financial_expense",
    resourceId: data.id,
  });
  revalidateFinance();
  return { id: data.id };
}

export async function cancelExpenseAction(
  expenseId: string,
  reason: string,
): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { error: "Informe o motivo do cancelamento." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_expenses")
    .update({ status: "canceled", cancel_reason: trimmed })
    .eq("id", expenseId)
    .eq("organization_id", ctx.organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "Despesa não encontrada.") };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.expense.cancel",
    resourceType: "financial_expense",
    resourceId: data.id,
  });
  revalidateFinance();
  return { id: data.id };
}

export async function createPlanAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = createPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (
    parsed.data.planType !== "monthly" &&
    (parsed.data.totalSessions == null || parsed.data.totalSessions <= 0)
  ) {
    return { error: "Informe o total de sessões do pacote." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_plans")
    .insert({
      organization_id: ctx.organizationId,
      patient_id: parsed.data.patientId,
      plan_type: parsed.data.planType,
      total_sessions: parsed.data.totalSessions,
      price: parsed.data.price,
      valid_from: parsed.data.validFrom ?? null,
      valid_until: parsed.data.validUntil ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "") };
  }

  if (parsed.data.planType === "prepaid_package" || parsed.data.planType === "monthly") {
    const origin = parsed.data.planType === "monthly" ? "subscription" : "plan";
    const description =
      parsed.data.planType === "monthly" ? "Mensalidade" : "Pacote pré-pago";
    const { error: chargeError } = await supabase.from("financial_charges").insert({
      organization_id: ctx.organizationId,
      patient_id: parsed.data.patientId,
      plan_id: data.id,
      origin,
      description,
      amount: parsed.data.price,
      due_date: parsed.data.validFrom ?? todayIsoDate(ctx.timezone),
      competence_date: parsed.data.validFrom ?? todayIsoDate(ctx.timezone),
      idempotency_key: randomUUID(),
    });
    if (chargeError) {
      await logAuditEvent({
        organizationId: ctx.organizationId,
        action: "finance.plan.create",
        resourceType: "financial_plan",
        resourceId: data.id,
      });
      revalidateFinance(parsed.data.patientId);
      return {
        id: data.id,
        warning: "Plano criado, mas a cobrança correspondente não foi lançada.",
      };
    }
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.plan.create",
    resourceType: "financial_plan",
    resourceId: data.id,
  });
  revalidateFinance(parsed.data.patientId);
  return { id: data.id };
}

export async function adjustPlanAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = adjustPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_plan_movements")
    .insert({
      organization_id: ctx.organizationId,
      plan_id: parsed.data.planId,
      movement: "adjust",
      delta: parsed.data.delta,
      reason: parsed.data.reason,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "") };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.plan.adjust",
    resourceType: "financial_plan_movement",
    resourceId: data.id,
  });
  revalidateFinance();
  return { id: data.id };
}

export async function restorePlanSessionAction(
  planId: string,
  sessionId: string,
  reason: string,
): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_plan_movements")
    .insert({
      organization_id: ctx.organizationId,
      plan_id: planId,
      session_id: sessionId,
      movement: "restore",
      delta: -1,
      reason: reason.trim() || "Restauração de sessão",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "") };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.plan.restore",
    resourceType: "financial_plan_movement",
    resourceId: data.id,
  });
  revalidateFinance();
  return { id: data.id };
}

export async function cancelPlanAction(
  planId: string,
  reason: string,
): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { error: "Informe o motivo do cancelamento." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_plans")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_reason: trimmed,
    })
    .eq("id", planId)
    .eq("organization_id", ctx.organizationId)
    .select("id, patient_id")
    .maybeSingle();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "Plano não encontrado.") };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.plan.cancel",
    resourceType: "financial_plan",
    resourceId: data.id,
  });
  revalidateFinance(data.patient_id as string);
  return { id: data.id };
}

export async function closePeriodAction(input: unknown): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const parsed = closePeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return { error: "O fim do período deve ser igual ou posterior ao início." };
  }

  const [charges, payments, expenses, patients] = await Promise.all([
    listCharges(ctx.organizationId),
    listPayments(ctx.organizationId),
    listExpenses(ctx.organizationId),
    listPatients(ctx.organizationId),
  ]);
  const names = new Map(patients.map((patient) => [patient.id, patient.preferred_name]));
  const views = buildChargeViews(charges, payments, names);

  const inPeriod = (date: string | null) =>
    Boolean(date && date >= parsed.data.periodStart && date <= parsed.data.periodEnd);

  const billedCents = views
    .filter(
      (charge) =>
        !["canceled", "refunded"].includes(charge.row.status) &&
        inPeriod(charge.row.competence_date),
    )
    .reduce((sum, charge) => sum + charge.amountCents, 0);

  const receivedCompetenceCents = views
    .filter((charge) => inPeriod(charge.row.competence_date))
    .reduce((sum, charge) => sum + charge.paidCents, 0);

  const receivedCashCents = payments
    .filter((payment) => !payment.voided_at && inPeriod(payment.paid_at.slice(0, 10)))
    .reduce((sum, payment) => sum + amountCents(payment.amount), 0);

  const expenseCents = expenses
    .filter((expense) => expense.status !== "canceled" && inPeriod(expense.due_date ?? expense.created_at.slice(0, 10)))
    .reduce((sum, expense) => sum + amountCents(expense.amount), 0);

  const snapshot = {
    billed: formatCents(billedCents),
    received_competence: formatCents(receivedCompetenceCents),
    received_cash: formatCents(receivedCashCents),
    expenses: formatCents(expenseCents),
    result: formatCents(receivedCompetenceCents - expenseCents),
  };

  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("financial_closings")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("period_start", parsed.data.periodStart)
    .eq("period_end", parsed.data.periodEnd)
    .maybeSingle();

  let closingId: string | undefined;
  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("financial_closings")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        totals_snapshot: snapshot,
        reopened_at: null,
        reopened_by: null,
      })
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (error || !data) return { error: mapFinanceError(error?.message ?? "") };
    closingId = data.id;
  } else {
    const { data, error } = await supabase
      .from("financial_closings")
      .insert({
        organization_id: ctx.organizationId,
        period_start: parsed.data.periodStart,
        period_end: parsed.data.periodEnd,
        status: "closed",
        closed_at: new Date().toISOString(),
        totals_snapshot: snapshot,
      })
      .select("id")
      .single();
    if (error || !data) return { error: mapFinanceError(error?.message ?? "") };
    closingId = data.id;
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.closing.close",
    resourceType: "financial_closing",
    resourceId: closingId,
  });
  revalidateFinance();
  return { id: closingId };
}

export async function reopenPeriodAction(closingId: string): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("financial_closings")
    .update({
      status: "open",
      reopened_at: new Date().toISOString(),
    })
    .eq("id", closingId)
    .eq("organization_id", ctx.organizationId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { error: mapFinanceError(error?.message ?? "Fechamento não encontrado.") };
  }
  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: "finance.closing.reopen",
    resourceType: "financial_closing",
    resourceId: data.id,
  });
  revalidateFinance();
  return { id: data.id };
}

export async function updateSecretaryFinanceAccessAction(
  input: unknown,
): Promise<FinanceActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora altera este acesso." };
  }
  const parsed = updateSecretaryAccessSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("practice_settings")
    .update({ secretary_finance_access: parsed.data.access })
    .eq("organization_id", organizationId);
  if (error) {
    return { error: "Não foi possível atualizar o acesso da secretaria." };
  }
  await logAuditEvent({
    organizationId,
    action: "finance.secretary_access.update",
    resourceType: "practice_settings",
    resourceId: organizationId,
    metadata: { access: parsed.data.access },
  });
  revalidateFinance();
  return { id: organizationId };
}

export async function exportFinanceCsvAction(input: unknown): Promise<FinanceActionResult> {
  const { organizationId, role } = await requireOrgContext();
  const access = await getFinanceAccess(organizationId, role);
  if (access === "none") {
    return { error: "Sem acesso ao financeiro." };
  }
  const parsed = exportCsvSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const [charges, payments, patients] = await Promise.all([
    listCharges(organizationId),
    listPayments(organizationId),
    listPatients(organizationId),
  ]);
  const names = new Map(patients.map((patient) => [patient.id, patient.preferred_name]));
  const views = buildChargeViews(charges, payments, names).filter((charge) => {
    const date =
      parsed.data.mode === "cash"
        ? payments
            .filter((payment) => payment.charge_id === charge.row.id && !payment.voided_at)
            .map((payment) => payment.paid_at.slice(0, 10))
            .sort()[0] ?? charge.row.competence_date
        : charge.row.competence_date;
    return date >= parsed.data.periodStart && date <= parsed.data.periodEnd;
  });
  return { csv: buildFinanceCsv({ charges: views, payments, columns: parsed.data.columns }) };
}

function receiptBody(input: {
  patientName: string;
  amountLabel: string;
  description: string;
  paidAt: string;
  method: string;
}): string {
  return [
    `Recebemos de ${input.patientName} a quantia de ${input.amountLabel}`,
    `referente a: ${input.description}.`,
    "",
    `Data do pagamento: ${input.paidAt}`,
    `Forma: ${input.method}`,
    "",
    "Documento administrativo emitido pelo VirgíniaPsi. Não substitui nota fiscal.",
  ].join("\n");
}

async function issueReceiptDocument(params: {
  organizationId: string;
  patientId: string | null;
  title: string;
  body: string;
}): Promise<FinanceActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      organization_id: params.organizationId,
      patient_id: params.patientId,
      title: params.title,
      document_kind: "recibo",
      sensitivity: "administrative",
    })
    .select("id")
    .single();
  if (documentError || !document) {
    return { error: "Não foi possível criar o recibo agora." };
  }

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      document_id: document.id,
      organization_id: params.organizationId,
      version: 1,
      body_snapshot: params.body,
      variables_snapshot: {},
    })
    .select("id")
    .single();
  if (versionError || !version) {
    return { error: "Recibo criado, mas a versão falhou." };
  }

  const pdfBytes = await generateDocumentPdf({
    title: params.title,
    body: params.body,
    footer: `Recibo gerado eletronicamente pelo VirgíniaPsi em ${new Date().toLocaleString("pt-BR")}.`,
  });
  const storagePath = buildStoragePath(
    params.organizationId,
    document.id,
    `${document.id}-v1.pdf`,
  );
  try {
    await uploadGeneratedFile(
      DOCUMENT_BUCKETS.clinicalDocuments,
      storagePath,
      pdfBytes,
      "application/pdf",
    );
  } catch {
    return { id: document.id, warning: "Recibo criado sem o PDF anexado." };
  }

  await supabase.from("document_files").insert({
    document_id: document.id,
    document_version_id: version.id,
    organization_id: params.organizationId,
    storage_path: storagePath,
    byte_size: pdfBytes.byteLength,
    sha256: sha256Hex(pdfBytes),
  });
  await supabase
    .from("documents")
    .update({ status: "issued", issued_at: new Date().toISOString(), current_version: 1 })
    .eq("id", document.id);

  await logAuditEvent({
    organizationId: params.organizationId,
    action: "finance.receipt.issue",
    resourceType: "document",
    resourceId: document.id,
  });
  revalidatePath("/app/documents");
  revalidateFinance(params.patientId);
  return { id: document.id };
}

export async function issueReceiptAction(paymentId: string): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };

  const supabase = await createSupabaseServerClient();
  const { data: payment } = await supabase
    .from("financial_payments")
    .select("*")
    .eq("id", paymentId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!payment || payment.voided_at) {
    return { error: "Pagamento não encontrado." };
  }
  const { data: charge } = await supabase
    .from("financial_charges")
    .select("*")
    .eq("id", payment.charge_id)
    .maybeSingle();
  if (!charge) {
    return { error: "Cobrança do pagamento não encontrada." };
  }
  const patients = await listPatients(ctx.organizationId);
  const patientName =
    patients.find((patient) => patient.id === charge.patient_id)?.full_name ?? "paciente";
  const paidAt = new Date(payment.paid_at as string).toLocaleString("pt-BR");
  return issueReceiptDocument({
    organizationId: ctx.organizationId,
    patientId: (charge.patient_id as string | null) ?? null,
    title: `Recibo — ${charge.description}`,
    body: receiptBody({
      patientName,
      amountLabel: formatBRL(amountCents(payment.amount as string | number)),
      description: String(charge.description),
      paidAt,
      method: PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS],
    }),
  });
}

export async function issueMonthlyReceiptBatchAction(
  periodStart?: string,
  periodEnd?: string,
): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const today = todayIsoDate(ctx.timezone);
  const bounds = monthBounds(periodStart ?? today);
  const start = periodStart ?? bounds.start;
  const end = periodEnd ?? bounds.end;

  const [charges, payments, patients] = await Promise.all([
    listCharges(ctx.organizationId),
    listPayments(ctx.organizationId),
    listPatients(ctx.organizationId),
  ]);
  const names = new Map(patients.map((patient) => [patient.id, patient.full_name]));
  const lines = payments
    .filter((payment) => {
      if (payment.voided_at) return false;
      const day = payment.paid_at.slice(0, 10);
      return day >= start && day <= end;
    })
    .map((payment) => {
      const charge = charges.find((item) => item.id === payment.charge_id);
      const name = charge?.patient_id ? names.get(charge.patient_id) ?? "—" : "—";
      return `${payment.paid_at.slice(0, 10)} · ${name} · ${charge?.description ?? "Cobrança"} · ${formatBRL(amountCents(payment.amount))} · ${PAYMENT_METHOD_LABELS[payment.method]}`;
    });

  if (lines.length === 0) {
    return { error: "Não há pagamentos neste período para emitir lote." };
  }

  return issueReceiptDocument({
    organizationId: ctx.organizationId,
    patientId: null,
    title: `Recibos em lote ${start} a ${end}`,
    body: ["Lote mensal de recibos", "", ...lines].join("\n"),
  });
}

export async function createSessionChargeAction(
  sessionId: string,
): Promise<FinanceActionResult> {
  const { ctx, error: denied } = await requireWriteAccess();
  if (denied) return { error: denied };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_session_charge", {
    p_session_id: sessionId,
    org_id: ctx.organizationId,
  });
  if (error) {
    return { error: mapFinanceError(error.message) };
  }
  revalidateFinance();
  return { id: (data as string | null) ?? null };
}
