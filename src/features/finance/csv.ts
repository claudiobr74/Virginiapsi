import {
  CHARGE_ORIGIN_LABELS,
  CHARGE_STATUS_LABELS,
  CSV_COLUMN_LABELS,
  PAYMENT_METHOD_LABELS,
  type ChargeView,
  type CsvColumn,
  type PaymentRow,
} from "@/features/finance/contracts";
import { formatCents } from "@/lib/finance/money";

function csvCell(value: string): string {
  if (/[",\n;]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function paymentMethods(chargeId: string, payments: PaymentRow[]): string {
  const methods = [
    ...new Set(
      payments
        .filter((payment) => payment.charge_id === chargeId && !payment.voided_at)
        .map((payment) => PAYMENT_METHOD_LABELS[payment.method]),
    ),
  ];
  return methods.join(" / ");
}

export function buildFinanceCsv(input: {
  charges: ChargeView[];
  payments: PaymentRow[];
  columns: CsvColumn[];
}): string {
  const header = input.columns.map((column) => csvCell(CSV_COLUMN_LABELS[column])).join(";");
  const lines = input.charges.map((charge) =>
    input.columns
      .map((column) => {
        switch (column) {
          case "competence_date":
            return charge.row.competence_date;
          case "due_date":
            return charge.row.due_date ?? "";
          case "patient":
            return charge.patientName ?? "";
          case "description":
            return charge.row.description;
          case "origin":
            return CHARGE_ORIGIN_LABELS[charge.row.origin];
          case "amount":
            return formatCents(charge.amountCents);
          case "paid":
            return formatCents(charge.paidCents);
          case "remaining":
            return formatCents(charge.remainingCents);
          case "status":
            return CHARGE_STATUS_LABELS[charge.row.status];
          case "method":
            return paymentMethods(charge.row.id, input.payments);
          default:
            return "";
        }
      })
      .map(csvCell)
      .join(";"),
  );
  return [header, ...lines].join("\n");
}
