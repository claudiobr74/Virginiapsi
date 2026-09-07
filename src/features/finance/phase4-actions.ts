"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CHARGE_ORIGIN_LABELS,
  CHARGE_STATUS_LABELS,
  CSV_COLUMN_LABELS,
  PAYMENT_METHOD_LABELS,
  amountCents,
  type CsvColumn,
} from "@/features/finance/contracts";
import {
  buildChargeViews,
  getFinanceAccess,
  listCharges,
  listExpenses,
  listPayments,
} from "@/features/finance/queries";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { formatCents } from "@/lib/finance/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const scopeSchema = z.enum(["competence", "cash"]);

const closeScopeSchema = z.object({
  periodStart: z.string().trim().min(10),
  periodEnd: z.string().trim().min(10),
  scope: scopeSchema,
});

const exportSchema = z.object({
  periodStart: z.string().trim().min(10),
  periodEnd: z.string().trim().min(10),
  mode: scopeSchema,
  columns: z.array(z.enum([
    "competence_date",
    "due_date",
    "patient",
    "description",
    "origin",
    "amount",
    "paid",
    "remaining",
    "status",
    "method",
  ])).min(1),
});

function dateInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function csvCell(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function inPeriod(date: string | null, start: string, end: string): boolean {
  return Boolean(date && date >= start && date <= end);
}

async function requireFinanceAccess(write: boolean) {
  const ctx = await requireOrgContext();
  const access = await getFinanceAccess(ctx.organizationId, ctx.role);
  if (access === "none" || (write && access !== "manage")) {
    return { ctx, error: write ? "Sem permissão para alterar o financeiro." : "Sem acesso ao financeiro." };
  }
  return { ctx, error: undefined };
}

export async function closeFinancialPeriodV2Action(input: unknown): Promise<{ id?: string; error?: string }> {
  const { ctx, error: denied } = await requireFinanceAccess(true);
  if (denied) return { error: denied };
  const parsed = closeScopeSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados de fechamento inválidos." };
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
  const { periodStart: start, periodEnd: end, scope } = parsed.data;

  const billedCents = views
    .filter((charge) => !["canceled", "refunded"].includes(charge.row.status) && inPeriod(charge.row.competence_date, start, end))
    .reduce((sum, charge) => sum + charge.amountCents, 0);
  const receivedCashCents = payments
    .filter((payment) => !payment.voided_at && inPeriod(dateInTimeZone(payment.paid_at, ctx.timezone), start, end))
    .reduce((sum, payment) => sum + amountCents(payment.amount), 0);
  const expenseCompetenceCents = expenses
    .filter((expense) => expense.status !== "canceled" && inPeriod(expense.due_date ?? expense.created_at.slice(0, 10), start, end))
    .reduce((sum, expense) => sum + amountCents(expense.amount), 0);
  const expenseCashCents = expenses
    .filter((expense) => expense.status === "paid" && expense.paid_at && inPeriod(dateInTimeZone(expense.paid_at, ctx.timezone), start, end))
    .reduce((sum, expense) => sum + amountCents(expense.amount), 0);

  const snapshot = scope === "competence"
    ? {
        scope,
        billed: formatCents(billedCents),
        expenses_competence: formatCents(expenseCompetenceCents),
        result_competence: formatCents(billedCents - expenseCompetenceCents),
      }
    : {
        scope,
        received_cash: formatCents(receivedCashCents),
        expenses_cash: formatCents(expenseCashCents),
        result_cash: formatCents(receivedCashCents - expenseCashCents),
      };

  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("financial_closings")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("scope", scope)
    .eq("period_start", start)
    .eq("period_end", end)
    .maybeSingle();

  const payload = {
    status: "closed" as const,
    closed_at: new Date().toISOString(),
    totals_snapshot: snapshot,
    reopened_at: null,
    reopened_by: null,
    reopen_reason: null,
  };

  let id: string | undefined;
  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("financial_closings")
      .update(payload)
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (error || !data) return { error: "Não foi possível fechar o período." };
    id = data.id;
  } else {
    const { data, error } = await supabase
      .from("financial_closings")
      .insert({
        organization_id: ctx.organizationId,
        scope,
        period_start: start,
        period_end: end,
        ...payload,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Não foi possível fechar o período." };
    id = data.id;
  }

  await logAuditEvent({
    organizationId: ctx.organizationId,
    action: scope === "cash" ? "finance.closing.cash.close" : "finance.closing.competence.close",
    resourceType: "financial_closing",
    resourceId: id,
    metadata: { scope, period_start: start, period_end: end },
  });
  revalidatePath("/app/finance");
  revalidatePath("/app");
  return { id };
}

export async function exportFinanceCsvV2Action(input: unknown): Promise<{ csv?: string; error?: string }> {
  const { ctx, error: denied } = await requireFinanceAccess(false);
  if (denied) return { error: denied };
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados de exportação inválidos." };

  const [charges, payments, patients] = await Promise.all([
    listCharges(ctx.organizationId),
    listPayments(ctx.organizationId),
    listPatients(ctx.organizationId),
  ]);
  const names = new Map(patients.map((patient) => [patient.id, patient.preferred_name]));
  const views = buildChargeViews(charges, payments, names);
  const chargeById = new Map(views.map((view) => [view.row.id, view]));
  const cols = parsed.data.columns as CsvColumn[];
  const header = [parsed.data.mode === "cash" ? "Data caixa" : "Competência", ...cols.map((column) => CSV_COLUMN_LABELS[column])]
    .map(csvCell)
    .join(";");

  if (parsed.data.mode === "cash") {
    const rows = payments
      .filter((payment) => !payment.voided_at)
      .map((payment) => ({ payment, cashDate: dateInTimeZone(payment.paid_at, ctx.timezone), charge: chargeById.get(payment.charge_id) }))
      .filter(({ cashDate, charge }) => Boolean(charge) && inPeriod(cashDate, parsed.data.periodStart, parsed.data.periodEnd))
      .map(({ payment, cashDate, charge }) => {
        const c = charge!;
        const paymentCents = amountCents(payment.amount);
        const values = cols.map((column) => {
          switch (column) {
            case "competence_date": return c.row.competence_date;
            case "due_date": return c.row.due_date ?? "";
            case "patient": return c.patientName ?? "";
            case "description": return c.row.description;
            case "origin": return CHARGE_ORIGIN_LABELS[c.row.origin];
            case "amount": return formatCents(paymentCents);
            case "paid": return formatCents(paymentCents);
            case "remaining": return formatCents(c.remainingCents);
            case "status": return CHARGE_STATUS_LABELS[c.row.status];
            case "method": return PAYMENT_METHOD_LABELS[payment.method];
            default: return "";
          }
        });
        return [cashDate, ...values].map(csvCell).join(";");
      });
    return { csv: [header, ...rows].join("\n") };
  }

  const rows = views
    .filter((charge) => inPeriod(charge.row.competence_date, parsed.data.periodStart, parsed.data.periodEnd))
    .map((charge) => {
      const methods = [...new Set(payments.filter((payment) => payment.charge_id === charge.row.id && !payment.voided_at).map((payment) => PAYMENT_METHOD_LABELS[payment.method]))].join(" / ");
      const values = cols.map((column) => {
        switch (column) {
          case "competence_date": return charge.row.competence_date;
          case "due_date": return charge.row.due_date ?? "";
          case "patient": return charge.patientName ?? "";
          case "description": return charge.row.description;
          case "origin": return CHARGE_ORIGIN_LABELS[charge.row.origin];
          case "amount": return formatCents(charge.amountCents);
          case "paid": return formatCents(charge.paidCents);
          case "remaining": return formatCents(charge.remainingCents);
          case "status": return CHARGE_STATUS_LABELS[charge.row.status];
          case "method": return methods;
          default: return "";
        }
      });
      return [charge.row.competence_date, ...values].map(csvCell).join(";");
    });
  return { csv: [header, ...rows].join("\n") };
}
