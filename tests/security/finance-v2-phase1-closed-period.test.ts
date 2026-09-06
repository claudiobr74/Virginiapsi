import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapOrganization, createAuthUser, openSession } from "./support/db";

describe("Financeiro v2 — F1 fechamento x caixa posterior", () => {
  let admin: string;
  let organizationId: string;
  let patientId: string;
  let chargeId: string;
  let paymentId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Financeiro F1 Fechamento");
    const db = await openSession({ userId: admin });
    try {
      const [patient] = await db.query<{ id: string }>(
        `insert into public.patients (
           organization_id, preferred_name, full_name, birth_date, default_session_value
         ) values ($1, 'Paciente F1', 'Paciente F1', '1990-01-01', 200.00)
         returning id`,
        [organizationId],
      );
      patientId = patient.id;

      const [charge] = await db.query<{ id: string }>(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount, due_date, competence_date
         ) values ($1, $2, 'session', 'Competência fechada', 200.00, '2026-06-30', '2026-06-20')
         returning id`,
        [organizationId, patientId],
      );
      chargeId = charge.id;

      await db.query(
        `insert into public.financial_closings (
           organization_id, period_start, period_end, status, closed_at, totals_snapshot
         ) values ($1, '2026-06-01', '2026-06-30', 'closed', now(), '{}'::jsonb)`,
        [organizationId],
      );
    } finally {
      await db.close();
    }
  });

  it("permite recebimento posterior e atualiza somente o status derivado", async () => {
    const db = await openSession({ userId: admin });
    try {
      const [payment] = await db.query<{ id: string }>(
        `insert into public.financial_payments (
           organization_id, charge_id, amount, method, paid_at
         ) values ($1, $2, 200.00, 'pix', '2026-07-05T12:00:00Z') returning id`,
        [organizationId, chargeId],
      );
      paymentId = payment.id;

      const [charge] = await db.query<{ status: string; amount: string; description: string }>(
        `select status, amount::text as amount, description
           from public.financial_charges where id = $1`,
        [chargeId],
      );
      expect(charge.status).toBe("paid");
      expect(charge.amount).toBe("200.00");
      expect(charge.description).toBe("Competência fechada");
    } finally {
      await db.close();
    }
  });

  it("continua bloqueando alteração econômica ou descritiva da cobrança fechada", async () => {
    const db = await openSession({ userId: admin });
    try {
      const amountError = await db.expectError(
        "update public.financial_charges set amount = 250.00 where id = $1",
        [chargeId],
      );
      expect(amountError).toMatch(/period is closed/i);

      const descriptionError = await db.expectError(
        "update public.financial_charges set description = 'Reescrita retroativa' where id = $1",
        [chargeId],
      );
      expect(descriptionError).toMatch(/period is closed/i);

      const cancelError = await db.expectError(
        `update public.financial_charges
            set status = 'canceled', cancel_reason = 'retroativo'
          where id = $1`,
        [chargeId],
      );
      expect(cancelError).toMatch(/period is closed/i);
    } finally {
      await db.close();
    }
  });

  it("permite estornar o pagamento posterior e recalcula o status sem reabrir a competência", async () => {
    const db = await openSession({ userId: admin });
    try {
      await db.query(
        `update public.financial_payments
            set voided_at = '2026-07-06T12:00:00Z', void_reason = 'Correção de caixa'
          where id = $1`,
        [paymentId],
      );
      const [charge] = await db.query<{ status: string }>(
        "select status from public.financial_charges where id = $1",
        [chargeId],
      );
      expect(["pending", "overdue"]).toContain(charge.status);

      const [closing] = await db.query<{ status: string }>(
        `select status from public.financial_closings
          where organization_id = $1 and period_start = '2026-06-01'`,
        [organizationId],
      );
      expect(closing.status).toBe("closed");
    } finally {
      await db.close();
    }
  });
});
