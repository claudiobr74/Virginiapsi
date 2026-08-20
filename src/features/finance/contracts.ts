import { z } from "zod";
import { centsFromCanonical, formatCents, parseToCents } from "@/lib/finance/money";

export const SECRETARY_FINANCE_ACCESS_VALUES = ["none", "view", "manage"] as const;
export type SecretaryFinanceAccess = (typeof SECRETARY_FINANCE_ACCESS_VALUES)[number];

export const SECRETARY_FINANCE_ACCESS_LABELS: Record<SecretaryFinanceAccess, string> = {
  none: "Sem acesso",
  view: "Somente leitura",
  manage: "Gestão operacional",
};

export const CHARGE_ORIGIN_VALUES = [
  "session",
  "plan",
  "subscription",
  "administrative",
] as const;
export type ChargeOrigin = (typeof CHARGE_ORIGIN_VALUES)[number];

export const CHARGE_ORIGIN_LABELS: Record<ChargeOrigin, string> = {
  session: "Sessão avulsa",
  plan: "Pacote",
  subscription: "Mensalidade",
  administrative: "Administrativo",
};

export const CHARGE_STATUS_VALUES = [
  "pending",
  "partially_paid",
  "paid",
  "overdue",
  "canceled",
  "refunded",
] as const;
export type ChargeStatus = (typeof CHARGE_STATUS_VALUES)[number];

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: "Pendente",
  partially_paid: "Parcial",
  paid: "Pago",
  overdue: "Atrasado",
  canceled: "Cancelado",
  refunded: "Estornado",
};

export const PAYMENT_METHOD_VALUES = [
  "pix",
  "cash",
  "card",
  "transfer",
  "courtesy",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  card: "Cartão",
  transfer: "Transferência",
  courtesy: "Cortesia",
  other: "Outro",
};

export const EXPENSE_STATUS_VALUES = ["pending", "paid", "overdue", "canceled"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUS_VALUES)[number];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: "Pendente",
  paid: "Paga",
  overdue: "Atrasada",
  canceled: "Cancelada",
};

export const PLAN_TYPE_VALUES = ["prepaid_package", "postpaid_package", "monthly"] as const;
export type PlanType = (typeof PLAN_TYPE_VALUES)[number];

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  prepaid_package: "Pacote pré-pago",
  postpaid_package: "Pacote pós-pago",
  monthly: "Mensalidade",
};

export const PLAN_STATUS_VALUES = ["active", "exhausted", "expired", "canceled"] as const;
export type PlanStatus = (typeof PLAN_STATUS_VALUES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  active: "Ativo",
  exhausted: "Esgotado",
  expired: "Vencido",
  canceled: "Cancelado",
};

export const PLAN_MOVEMENT_VALUES = ["consume", "restore", "adjust", "renew"] as const;
export type PlanMovement = (typeof PLAN_MOVEMENT_VALUES)[number];

export const PLAN_MOVEMENT_LABELS: Record<PlanMovement, string> = {
  consume: "Consumo",
  restore: "Restauração",
  adjust: "Ajuste",
  renew: "Renovação",
};

export const CLOSING_STATUS_VALUES = ["open", "closed"] as const;
export type ClosingStatus = (typeof CLOSING_STATUS_VALUES)[number];

const moneyWire = z.union([z.string(), z.number()]);

export const chargeRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patient_id: z.string().uuid().nullable(),
  session_id: z.string().uuid().nullable(),
  plan_id: z.string().uuid().nullable(),
  origin: z.enum(CHARGE_ORIGIN_VALUES),
  description: z.string(),
  amount: moneyWire,
  due_date: z.string().nullable(),
  competence_date: z.string(),
  status: z.enum(CHARGE_STATUS_VALUES),
  canceled_at: z.string().nullable(),
  canceled_by: z.string().uuid().nullable(),
  cancel_reason: z.string().nullable(),
  nfse_requested_at: z.string().nullable(),
  idempotency_key: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ChargeRow = z.infer<typeof chargeRowSchema>;

export const paymentRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  charge_id: z.string().uuid(),
  amount: moneyWire,
  paid_at: z.string(),
  method: z.enum(PAYMENT_METHOD_VALUES),
  notes: z.string().nullable(),
  voided_at: z.string().nullable(),
  voided_by: z.string().uuid().nullable(),
  void_reason: z.string().nullable(),
  registered_by: z.string().uuid().nullable(),
  idempotency_key: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PaymentRow = z.infer<typeof paymentRowSchema>;

export const expenseRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  category: z.string(),
  supplier: z.string().nullable(),
  description: z.string(),
  amount: moneyWire,
  due_date: z.string().nullable(),
  paid_at: z.string().nullable(),
  recurrence: z.unknown().nullable(),
  attachment_document_id: z.string().uuid().nullable(),
  status: z.enum(EXPENSE_STATUS_VALUES),
  canceled_at: z.string().nullable(),
  canceled_by: z.string().uuid().nullable(),
  cancel_reason: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ExpenseRow = z.infer<typeof expenseRowSchema>;

export const planRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  plan_type: z.enum(PLAN_TYPE_VALUES),
  total_sessions: z.number().int().nullable(),
  used_sessions: z.number().int(),
  price: moneyWire,
  valid_from: z.string().nullable(),
  valid_until: z.string().nullable(),
  status: z.enum(PLAN_STATUS_VALUES),
  canceled_at: z.string().nullable(),
  canceled_by: z.string().uuid().nullable(),
  cancel_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PlanRow = z.infer<typeof planRowSchema>;

export const planMovementRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  session_id: z.string().uuid().nullable(),
  movement: z.enum(PLAN_MOVEMENT_VALUES),
  delta: z.number().int(),
  reason: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type PlanMovementRow = z.infer<typeof planMovementRowSchema>;

export const closingRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  status: z.enum(CLOSING_STATUS_VALUES),
  closed_at: z.string().nullable(),
  closed_by: z.string().uuid().nullable(),
  reopened_at: z.string().nullable(),
  reopened_by: z.string().uuid().nullable(),
  totals_snapshot: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ClosingRow = z.infer<typeof closingRowSchema>;

const moneyInput = z
  .string()
  .trim()
  .min(1, "Informe o valor.")
  .transform((value, ctx) => {
    try {
      const cents = parseToCents(value);
      if (cents < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O valor não pode ser negativo." });
        return z.NEVER;
      }
      return formatCents(cents);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um valor válido." });
      return z.NEVER;
    }
  });

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

export const createChargeSchema = z.object({
  patientId: z.string().uuid("Selecione o paciente.").optional().or(z.literal("")),
  origin: z.enum(CHARGE_ORIGIN_VALUES),
  description: z
    .string()
    .trim()
    .min(1, "Informe a descrição.")
    .max(300, "Descrição muito longa."),
  amount: moneyInput,
  dueDate: optionalDate,
  competenceDate: z.string().trim().min(10, "Informe a competência."),
  idempotencyKey: z.string().uuid().optional(),
});
export type CreateChargeValues = z.input<typeof createChargeSchema>;

export const registerPaymentSchema = z.object({
  chargeId: z.string().uuid(),
  amount: moneyInput,
  method: z.enum(PAYMENT_METHOD_VALUES),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
  paidAt: optionalDate,
  idempotencyKey: z.string().uuid().optional(),
});
export type RegisterPaymentValues = z.input<typeof registerPaymentSchema>;

export const cancelChargeSchema = z.object({
  chargeId: z.string().uuid(),
  reason: z.string().trim().min(3, "Informe o motivo.").max(300),
  asRefund: z.boolean().optional(),
});

export const voidPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(3, "Informe o motivo.").max(300),
});

export const createExpenseSchema = z.object({
  category: z.string().trim().min(1, "Informe a categoria.").max(80),
  supplier: z.string().trim().max(160).optional().or(z.literal("")),
  description: z.string().trim().min(1, "Informe a descrição.").max(300),
  amount: moneyInput,
  dueDate: optionalDate,
  recurringMonthly: z.boolean().optional(),
});
export type CreateExpenseValues = z.input<typeof createExpenseSchema>;

export const createPlanSchema = z.object({
  patientId: z.string().uuid("Selecione o paciente."),
  planType: z.enum(PLAN_TYPE_VALUES),
  totalSessions: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um número inteiro de sessões." });
        return z.NEVER;
      }
      return parsed;
    }),
  price: moneyInput,
  validFrom: optionalDate,
  validUntil: optionalDate,
});
export type CreatePlanValues = z.input<typeof createPlanSchema>;

export const adjustPlanSchema = z.object({
  planId: z.string().uuid(),
  delta: z.number().int(),
  reason: z.string().trim().min(3, "Informe o motivo do ajuste.").max(300),
});

export const closePeriodSchema = z.object({
  periodStart: z.string().trim().min(10, "Informe o início."),
  periodEnd: z.string().trim().min(10, "Informe o fim."),
});

export const CSV_COLUMN_VALUES = [
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
] as const;
export type CsvColumn = (typeof CSV_COLUMN_VALUES)[number];

export const CSV_COLUMN_LABELS: Record<CsvColumn, string> = {
  competence_date: "Competência",
  due_date: "Vencimento",
  patient: "Paciente",
  description: "Descrição",
  origin: "Origem",
  amount: "Valor",
  paid: "Recebido",
  remaining: "Saldo",
  status: "Situação",
  method: "Forma",
};

export const exportCsvSchema = z.object({
  periodStart: z.string().trim().min(10),
  periodEnd: z.string().trim().min(10),
  columns: z.array(z.enum(CSV_COLUMN_VALUES)).min(1, "Escolha ao menos uma coluna."),
  mode: z.enum(["competence", "cash"]),
});
export type ExportCsvValues = z.input<typeof exportCsvSchema>;

export const updateSecretaryAccessSchema = z.object({
  access: z.enum(SECRETARY_FINANCE_ACCESS_VALUES),
});

export interface ChargeView {
  row: ChargeRow;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  patientName: string | null;
}

export interface FinanceSnapshot {
  access: SecretaryFinanceAccess;
  charges: ChargeView[];
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  plans: PlanRow[];
  closings: ClosingRow[];
  secretaryAccessSetting: SecretaryFinanceAccess;
}

export function amountCents(value: string | number): number {
  return centsFromCanonical(value);
}

export function todayIsoDate(timeZone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function monthBounds(isoDate: string): { start: string; end: string } {
  const [year, month] = isoDate.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  };
}
