import { beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

async function createPatient(
  actorUserId: string,
  organizationId: string,
  name: string,
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const [row] = await session.query<{ id: string }>(
      `insert into public.patients (
         organization_id, preferred_name, full_name, birth_date
       ) values ($1, $2, $2, '1990-01-01') returning id`,
      [organizationId, name],
    );
    return row.id;
  } finally {
    await session.close();
  }
}

describe("Financeiro v2 — F1 criação atômica de planos", () => {
  let admin: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Financeiro v2 F1 Atomic");
  });

  it("cria pacote pré-pago e cobrança inicial ligados na mesma operação", async () => {
    const patientId = await createPatient(admin, organizationId, "Paciente Pré-pago Atomic");
    const db = await openSession({ userId: admin });
    try {
      const [result] = await db.query<{ plan_id: string }>(
        `select public.create_financial_plan_with_initial_charge(
           $1, $2, 'prepaid_package', 4, 1200.00, '2026-10-01', null, $3
         ) as plan_id`,
        [organizationId, patientId, "atomic-prepaid"],
      );
      expect(result.plan_id).toBeTruthy();

      const [charge] = await db.query<{
        plan_id: string;
        origin: string;
        amount: string;
        competence_date: string;
      }>(
        `select plan_id, origin, amount::text as amount, competence_date::text as competence_date
           from public.financial_charges
          where organization_id = $1 and plan_id = $2`,
        [organizationId, result.plan_id],
      );
      expect(charge.plan_id).toBe(result.plan_id);
      expect(charge.origin).toBe("plan");
      expect(charge.amount).toBe("1200.00");
      expect(charge.competence_date).toBe("2026-10-01");
    } finally {
      await db.close();
    }
  });

  it("cria mensalidade e cobrança inicial ligados na mesma operação", async () => {
    const patientId = await createPatient(admin, organizationId, "Paciente Mensal Atomic");
    const db = await openSession({ userId: admin });
    try {
      const [result] = await db.query<{ plan_id: string }>(
        `select public.create_financial_plan_with_initial_charge(
           $1, $2, 'monthly', null, 900.00, '2026-11-01', null, $3
         ) as plan_id`,
        [organizationId, patientId, "atomic-monthly"],
      );
      expect(result.plan_id).toBeTruthy();

      const [charge] = await db.query<{ origin: string; description: string; amount: string }>(
        `select origin, description, amount::text as amount
           from public.financial_charges
          where organization_id = $1 and plan_id = $2`,
        [organizationId, result.plan_id],
      );
      expect(charge.origin).toBe("subscription");
      expect(charge.description).toBe("Mensalidade");
      expect(charge.amount).toBe("900.00");
    } finally {
      await db.close();
    }
  });

  it("cria pacote pós-pago sem cobrança inicial", async () => {
    const patientId = await createPatient(admin, organizationId, "Paciente Pós-pago Atomic");
    const db = await openSession({ userId: admin });
    try {
      const [result] = await db.query<{ plan_id: string }>(
        `select public.create_financial_plan_with_initial_charge(
           $1, $2, 'postpaid_package', 6, 1800.00, '2026-12-01', null, $3
         ) as plan_id`,
        [organizationId, patientId, "atomic-postpaid"],
      );
      expect(result.plan_id).toBeTruthy();

      const [count] = await db.query<{ count: string }>(
        `select count(*)::text as count
           from public.financial_charges
          where organization_id = $1 and plan_id = $2`,
        [organizationId, result.plan_id],
      );
      expect(count.count).toBe("0");
    } finally {
      await db.close();
    }
  });

  it("faz rollback do plano se a cobrança inicial falhar", async () => {
    const patientId = await createPatient(admin, organizationId, "Paciente Rollback Atomic");
    const db = await openSession({ userId: admin });
    try {
      await db.query(
        `insert into public.financial_closings (
           organization_id, period_start, period_end, status, closed_at, totals_snapshot
         ) values ($1, '2026-06-01', '2026-06-30', 'closed', now(), '{}'::jsonb)`,
        [organizationId],
      );

      const error = await db.expectError(
        `select public.create_financial_plan_with_initial_charge(
           $1, $2, 'prepaid_package', 4, 1200.00, '2026-06-15', null, $3
         )`,
        [organizationId, patientId, "atomic-rollback"],
      );
      expect(error).toMatch(/period is closed/i);

      const [planCount] = await db.query<{ count: string }>(
        `select count(*)::text as count
           from public.financial_plans
          where organization_id = $1 and patient_id = $2`,
        [organizationId, patientId],
      );
      const [chargeCount] = await db.query<{ count: string }>(
        `select count(*)::text as count
           from public.financial_charges
          where organization_id = $1 and patient_id = $2`,
        [organizationId, patientId],
      );
      expect(planCount.count).toBe("0");
      expect(chargeCount.count).toBe("0");
    } finally {
      await db.close();
    }
  });
});
