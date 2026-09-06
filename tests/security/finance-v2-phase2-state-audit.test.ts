import { beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapOrganization,
  createAuthUser,
  openSession,
  runAsAdmin,
} from "./support/db";

async function createPatient(
  actorUserId: string,
  organizationId: string,
  name: string,
): Promise<string> {
  const db = await openSession({ userId: actorUserId });
  try {
    const [row] = await db.query<{ id: string }>(
      `insert into public.patients (
         organization_id, preferred_name, full_name, birth_date
       ) values ($1, $2, $2, '1990-01-01') returning id`,
      [organizationId, name],
    );
    return row.id;
  } finally {
    await db.close();
  }
}

describe("Financeiro v2 — F2 estados e auditoria", () => {
  let admin: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Financeiro F2");
    await runAsAdmin(async (db) => {
      await db.query(
        "update public.organizations set timezone = 'America/Sao_Paulo' where id = $1",
        [organizationId],
      );
    });
  });

  it("view efetiva torna cobrança vencida overdue sem mutar o fato base", async () => {
    const patientId = await createPatient(admin, organizationId, "Paciente atraso F2");
    const db = await openSession({ userId: admin });
    try {
      const [charge] = await db.query<{ id: string }>(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount,
           due_date, competence_date, status
         ) values ($1, $2, 'administrative', 'Atraso F2', 300.00,
                   '2020-01-01', '2020-01-01', 'pending')
         returning id`,
        [organizationId, patientId],
      );

      await runAsAdmin(async (adminDb) => {
        await adminDb.query(
          "update public.financial_charges set status = 'pending' where id = $1",
          [charge.id],
        );
      });

      const [base] = await db.query<{ status: string }>(
        "select status from public.financial_charges where id = $1",
        [charge.id],
      );
      const [effective] = await db.query<{ status: string }>(
        "select status from public.financial_charges_effective where id = $1",
        [charge.id],
      );
      expect(base.status).toBe("pending");
      expect(effective.status).toBe("overdue");
    } finally {
      await db.close();
    }
  });

  it("overdue tem precedência sobre parcialmente pago enquanto houver saldo vencido", async () => {
    const patientId = await createPatient(admin, organizationId, "Paciente parcial vencido");
    const db = await openSession({ userId: admin });
    try {
      const [charge] = await db.query<{ id: string }>(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount,
           due_date, competence_date
         ) values ($1, $2, 'administrative', 'Parcial vencido', 400.00,
                   '2020-01-01', '2020-01-01') returning id`,
        [organizationId, patientId],
      );
      await db.query(
        `insert into public.financial_payments (
           organization_id, charge_id, amount, method
         ) values ($1, $2, 100.00, 'pix')`,
        [organizationId, charge.id],
      );

      const [base] = await db.query<{ status: string }>(
        "select status from public.financial_charges where id = $1",
        [charge.id],
      );
      const [effective] = await db.query<{ status: string }>(
        "select status from public.financial_charges_effective where id = $1",
        [charge.id],
      );
      expect(base.status).toBe("overdue");
      expect(effective.status).toBe("overdue");
    } finally {
      await db.close();
    }
  });

  it("view efetiva deriva atraso de despesa e preserva paid/canceled", async () => {
    const db = await openSession({ userId: admin });
    try {
      const [expense] = await db.query<{ id: string }>(
        `insert into public.financial_expenses (
           organization_id, category, description, amount, due_date, status
         ) values ($1, 'Teste', 'Despesa vencida', 50.00, '2020-01-01', 'pending')
         returning id`,
        [organizationId],
      );
      await runAsAdmin(async (adminDb) => {
        await adminDb.query(
          "update public.financial_expenses set status = 'pending' where id = $1",
          [expense.id],
        );
      });
      const [effective] = await db.query<{ status: string }>(
        "select status from public.financial_expenses_effective where id = $1",
        [expense.id],
      );
      expect(effective.status).toBe("overdue");

      await db.query(
        "update public.financial_expenses set status = 'paid', paid_at = now() where id = $1",
        [expense.id],
      );
      const [paid] = await db.query<{ status: string }>(
        "select status from public.financial_expenses_effective where id = $1",
        [expense.id],
      );
      expect(paid.status).toBe("paid");
    } finally {
      await db.close();
    }
  });

  it("reabertura exige motivo real e registra ator, data e motivo", async () => {
    const db = await openSession({ userId: admin });
    try {
      const [closing] = await db.query<{ id: string }>(
        `insert into public.financial_closings (
           organization_id, period_start, period_end, status, closed_at
         ) values ($1, '2030-01-01', '2030-01-31', 'closed', now()) returning id`,
        [organizationId],
      );

      const error = await db.expectError(
        "update public.financial_closings set status = 'open' where id = $1",
        [closing.id],
      );
      expect(error).toMatch(/reopen reason is required/i);

      await db.query(
        `update public.financial_closings
            set status = 'open', reopen_reason = 'Correção contábil solicitada pela responsável'
          where id = $1`,
        [closing.id],
      );
      const [row] = await db.query<{
        status: string;
        reopen_reason: string;
        reopened_by: string;
        reopened_at: string;
      }>(
        `select status, reopen_reason, reopened_by::text, reopened_at::text
           from public.financial_closings where id = $1`,
        [closing.id],
      );
      expect(row.status).toBe("open");
      expect(row.reopen_reason).toBe("Correção contábil solicitada pela responsável");
      expect(row.reopened_by).toBe(admin);
      expect(row.reopened_at).toBeTruthy();
    } finally {
      await db.close();
    }
  });

  it("anon não lê os read models financeiros da F2", async () => {
    const anon = await openSession({ role: "anon" });
    try {
      const chargeError = await anon.expectError(
        "select * from public.financial_charges_effective limit 1",
      );
      const expenseError = await anon.expectError(
        "select * from public.financial_expenses_effective limit 1",
      );
      expect(chargeError).toMatch(/permission denied/i);
      expect(expenseError).toMatch(/permission denied/i);
    } finally {
      await anon.close();
    }
  });
});
