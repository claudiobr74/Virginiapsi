import { beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapOrganization,
  createAuthUser,
  openSession,
  runAsAdmin,
} from "./support/db";

async function createPatient(actorUserId: string, organizationId: string, name: string) {
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

describe("Financeiro v2 — F4 caixa x competência", () => {
  let admin: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Financeiro F4");
    patientId = await createPatient(admin, organizationId, "Paciente F4");
    await runAsAdmin(async (db) => {
      await db.query(
        "update public.organizations set timezone = 'America/Sao_Paulo' where id = $1",
        [organizationId],
      );
    });
  });

  it("fechamento de competência não bloqueia recebimento posterior em caixa aberto", async () => {
    const db = await openSession({ userId: admin });
    try {
      const [charge] = await db.query<{ id: string }>(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount,
           due_date, competence_date
         ) values ($1, $2, 'administrative', 'Janeiro', 500.00,
                   '2030-01-31', '2030-01-31') returning id`,
        [organizationId, patientId],
      );

      await db.query(
        `insert into public.financial_closings (
           organization_id, scope, period_start, period_end, status, closed_at
         ) values ($1, 'competence', '2030-01-01', '2030-01-31', 'closed', now())`,
        [organizationId],
      );

      const [payment] = await db.query<{ id: string }>(
        `insert into public.financial_payments (
           organization_id, charge_id, amount, paid_at, method
         ) values ($1, $2, 500.00, '2030-02-05T12:00:00-03:00', 'pix') returning id`,
        [organizationId, charge.id],
      );
      expect(payment.id).toBeTruthy();
    } finally {
      await db.close();
    }
  });

  it("fechamento de caixa bloqueia pagamento retrodatado para o período fechado", async () => {
    const db = await openSession({ userId: admin });
    try {
      const [charge] = await db.query<{ id: string }>(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount,
           due_date, competence_date
         ) values ($1, $2, 'administrative', 'Fevereiro', 700.00,
                   '2030-02-10', '2030-02-10') returning id`,
        [organizationId, patientId],
      );

      await db.query(
        `insert into public.financial_closings (
           organization_id, scope, period_start, period_end, status, closed_at
         ) values ($1, 'cash', '2030-02-01', '2030-02-28', 'closed', now())`,
        [organizationId],
      );

      const error = await db.expectError(
        `insert into public.financial_payments (
           organization_id, charge_id, amount, paid_at, method
         ) values ($1, $2, 700.00, '2030-02-20T12:00:00-03:00', 'pix')`,
        [organizationId, charge.id],
      );
      expect(error).toMatch(/cash period is closed/i);
    } finally {
      await db.close();
    }
  });

  it("mesmo intervalo pode ser fechado separadamente para competência e caixa", async () => {
    const db = await openSession({ userId: admin });
    try {
      await db.query(
        `insert into public.financial_closings (
           organization_id, scope, period_start, period_end, status, closed_at
         ) values
           ($1, 'competence', '2031-03-01', '2031-03-31', 'closed', now()),
           ($1, 'cash',       '2031-03-01', '2031-03-31', 'closed', now())`,
        [organizationId],
      );
      const rows = await db.query<{ scope: string }>(
        `select scope::text from public.financial_closings
          where organization_id = $1
            and period_start = '2031-03-01'
            and period_end = '2031-03-31'
          order by scope`,
        [organizationId],
      );
      expect(rows.map((row) => row.scope)).toEqual(["cash", "competence"]);
    } finally {
      await db.close();
    }
  });

  it("helper de escopo e trigger interno não ficam expostos como RPC", async () => {
    const anon = await openSession({ role: "anon" });
    const authenticated = await openSession({ userId: admin });
    try {
      const anonError = await anon.expectError(
        "select public.finance_scope_period_is_closed($1, current_date, 'cash')",
        [organizationId],
      );
      const authError = await authenticated.expectError(
        "select public.finance_scope_period_is_closed($1, current_date, 'cash')",
        [organizationId],
      );
      expect(anonError).toMatch(/permission denied/i);
      expect(authError).toMatch(/permission denied/i);
    } finally {
      await anon.close();
      await authenticated.close();
    }
  });
});
