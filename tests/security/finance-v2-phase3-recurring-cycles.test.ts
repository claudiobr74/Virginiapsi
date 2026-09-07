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

describe("Financeiro v2 — F3 planos e recorrências", () => {
  let admin: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Financeiro F3");
    await runAsAdmin(async (db) => {
      await db.query(
        "update public.organizations set timezone = 'America/Sao_Paulo' where id = $1",
        [organizationId],
      );
    });
  });

  it("mensalidade materializa aniversários mensais, preserva dia e é idempotente", async () => {
    const patientId = await createPatient(admin, organizationId, "Mensal F3");
    const db = await openSession({ userId: admin });
    try {
      const [plan] = await db.query<{ id: string }>(
        `select public.create_financial_plan_with_initial_charge(
           $1, $2, 'monthly', null, 900.00, '2030-01-31', '2030-03-31', $3
         )::text as id`,
        [organizationId, patientId, crypto.randomUUID()],
      );

      await runAsAdmin(async (adminDb) => {
        await adminDb.query(
          "select public.materialize_finance_recurring_items('2030-03-31'::date)",
        );
        await adminDb.query(
          "select public.materialize_finance_recurring_items('2030-03-31'::date)",
        );
      });

      const charges = await db.query<{
        competence_date: string;
        amount: string;
        origin: string;
      }>(
        `select competence_date::text, amount::text, origin::text
           from public.financial_charges
          where plan_id = $1
          order by competence_date`,
        [plan.id],
      );

      expect(charges).toHaveLength(3);
      expect(charges.map((row) => row.competence_date)).toEqual([
        "2030-01-31",
        "2030-02-28",
        "2030-03-31",
      ]);
      expect(charges.every((row) => row.amount === "900.00")).toBe(true);
      expect(charges.every((row) => row.origin === "subscription")).toBe(true);
    } finally {
      await db.close();
    }
  });

  it("despesa mensal gera ocorrências reais e não duplica em nova execução", async () => {
    const db = await openSession({ userId: admin });
    try {
      const [root] = await db.query<{ id: string }>(
        `insert into public.financial_expenses (
           organization_id, category, supplier, description, amount, due_date, recurrence
         ) values (
           $1, 'Aluguel', 'Locador', 'Aluguel consultório', 2500.00,
           '2031-01-31', '{"interval":"monthly"}'::jsonb
         ) returning id`,
        [organizationId],
      );

      await runAsAdmin(async (adminDb) => {
        await adminDb.query(
          "select public.materialize_finance_recurring_items('2031-03-31'::date)",
        );
        await adminDb.query(
          "select public.materialize_finance_recurring_items('2031-03-31'::date)",
        );
      });

      const rows = await db.query<{
        due_date: string;
        recurrence_series_key: string;
        generated: boolean;
      }>(
        `select due_date::text,
                recurrence_series_key,
                coalesce((recurrence ->> 'generated')::boolean, false) as generated
           from public.financial_expenses
          where recurrence_series_key = $1
          order by due_date`,
        [root.id],
      );

      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.due_date)).toEqual([
        "2031-01-31",
        "2031-02-28",
        "2031-03-31",
      ]);
      expect(rows[0]?.generated).toBe(false);
      expect(rows[1]?.generated).toBe(true);
      expect(rows[2]?.generated).toBe(true);
    } finally {
      await db.close();
    }
  });

  it("pacote pós-pago cria uma única cobrança consolidada ao esgotar", async () => {
    const patientId = await createPatient(admin, organizationId, "Pós-pago F3");
    const db = await openSession({ userId: admin });
    try {
      const [plan] = await db.query<{ id: string }>(
        `insert into public.financial_plans (
           organization_id, patient_id, plan_type, total_sessions, price, status
         ) values ($1, $2, 'postpaid_package', 2, 700.00, 'active') returning id`,
        [organizationId, patientId],
      );

      await db.query(
        `insert into public.financial_plan_movements (
           organization_id, plan_id, movement, delta, reason
         ) values ($1, $2, 'consume', 1, 'Sessão 1')`,
        [organizationId, plan.id],
      );

      const before = await db.query<{ count: number }>(
        "select count(*)::int as count from public.financial_charges where plan_id = $1",
        [plan.id],
      );
      expect(before[0]?.count).toBe(0);

      await db.query(
        `insert into public.financial_plan_movements (
           organization_id, plan_id, movement, delta, reason
         ) values ($1, $2, 'consume', 1, 'Sessão 2')`,
        [organizationId, plan.id],
      );

      const charges = await db.query<{
        amount: string;
        origin: string;
        description: string;
      }>(
        `select amount::text, origin::text, description
           from public.financial_charges
          where plan_id = $1`,
        [plan.id],
      );
      const [updated] = await db.query<{ status: string; used_sessions: number }>(
        "select status::text, used_sessions from public.financial_plans where id = $1",
        [plan.id],
      );

      expect(charges).toEqual([
        { amount: "700.00", origin: "plan", description: "Pacote pós-pago" },
      ]);
      expect(updated.status).toBe("exhausted");
      expect(updated.used_sessions).toBe(2);
    } finally {
      await db.close();
    }
  });

  it("recorrência mensal exige vencimento para ter âncora determinística", async () => {
    const db = await openSession({ userId: admin });
    try {
      const error = await db.expectError(
        `insert into public.financial_expenses (
           organization_id, category, description, amount, recurrence
         ) values ($1, 'Teste', 'Sem âncora', 50.00, '{"interval":"monthly"}'::jsonb)`,
        [organizationId],
      );
      expect(error).toMatch(/requires due date/i);
    } finally {
      await db.close();
    }
  });

  it("materializador é interno e não pode ser chamado por anon ou authenticated", async () => {
    const anon = await openSession({ role: "anon" });
    const authenticated = await openSession({ userId: admin });
    try {
      const anonError = await anon.expectError(
        "select public.materialize_finance_recurring_items(current_date)",
      );
      const authError = await authenticated.expectError(
        "select public.materialize_finance_recurring_items(current_date)",
      );
      expect(anonError).toMatch(/permission denied/i);
      expect(authError).toMatch(/permission denied/i);
    } finally {
      await anon.close();
      await authenticated.close();
    }
  });
});
