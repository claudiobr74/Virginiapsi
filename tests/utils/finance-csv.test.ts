import { describe, expect, it } from "vitest";
import { buildFinanceCsv } from "@/features/finance/csv";
import type { ChargeView, PaymentRow } from "@/features/finance/contracts";

function charge(partial: Partial<ChargeView["row"]> & { id: string }): ChargeView {
  const row = {
    organization_id: "00000000-0000-4000-8000-000000000001",
    patient_id: "00000000-0000-4000-8000-000000000002",
    session_id: null,
    plan_id: null,
    origin: "administrative" as const,
    description: "Sessão",
    amount: "150.50",
    due_date: "2026-08-20",
    competence_date: "2026-08-01",
    status: "paid" as const,
    canceled_at: null,
    canceled_by: null,
    cancel_reason: null,
    nfse_requested_at: null,
    idempotency_key: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...partial,
  };
  return {
    row,
    amountCents: 15050,
    paidCents: 15050,
    remainingCents: 0,
    patientName: "Ana",
  };
}

describe("CSV financeiro", () => {
  it("usa ponto-e-vírgula e não interpola float", () => {
    const csv = buildFinanceCsv({
      charges: [charge({ id: "00000000-0000-4000-8000-000000000010" })],
      payments: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          organization_id: "00000000-0000-4000-8000-000000000001",
          charge_id: "00000000-0000-4000-8000-000000000010",
          amount: "150.50",
          paid_at: "2026-08-05T12:00:00.000Z",
          method: "pix",
          notes: null,
          voided_at: null,
          voided_by: null,
          void_reason: null,
          registered_by: null,
          idempotency_key: null,
          created_at: "2026-08-05T12:00:00.000Z",
          updated_at: "2026-08-05T12:00:00.000Z",
        } satisfies PaymentRow,
      ],
      columns: ["patient", "amount", "paid", "method"],
    });
    expect(csv.split("\n")[0]).toBe("Paciente;Valor;Recebido;Forma");
    expect(csv).toContain("Ana;150.50;150.50;PIX");
    expect(csv).not.toContain("150.499");
  });
});
