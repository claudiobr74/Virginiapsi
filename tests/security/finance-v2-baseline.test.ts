import { beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

async function createPatient(
  actorUserId: string,
  organizationId: string,
  input: { name: string; fee?: string },
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const [row] = await session.query<{ id: string }>(
      `insert into public.patients (
         organization_id, preferred_name, full_name, birth_date, default_session_value
       ) values ($1, $2, $2, '1990-01-01', $3) returning id`,
      [organizationId, input.name, input.fee ?? null],
    );
    return row.id;
  } finally {
    await session.close();
  }
}

async function startSession(
  actorUserId: string,
  organizationId: string,
  patientId: string,
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const [row] = await session.query<{ start_clinical_session: string }>(
      "select public.start_clinical_session($1, $2) as start_clinical_session",
      [organizationId, patientId],
    );
    return row.start_clinical_session;
  } finally {
    await session.close();
  }
}

describe("Financeiro v2 — baseline funcional + F1 regras críticas", () => {
  let admin: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Financeiro v2");
  });

  it("pagamento parcial atualiza cobrança e estorno restaura o saldo lógico", async () => {
    const patientId = await createPatient(admin, organizationId, {
      name: "Paciente Pagamento Parcial",
    });
    const db = await openSession({ userId: admin });
    try {
      const [charge] = await db.query<{ id: string }>(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount, due_date, competence_date
         ) values ($1, $2, 'administrative', 'Baseline parcial', 300.00, '2027-12-31', '2026-09-01')
         returning id`,
        [organizationId, patientId],
      );
      const [payment] = await db.query<{ id: string }>(
        `insert into public.financial_payments (organization_id, charge_id, amount, method)
         values ($1, $2, 125.00, 'pix') returning id`,
        [organizationId, charge.id],
      );
      const [partial] = await db.query<{ status: string; paid: string }>(
        `select c.status, coalesce(sum(p.amount) filter (where p.voided_at is null), 0)::text as paid
           from public.financial_charges c
           left join public.financial_payments p on p.charge_id = c.id
          where c.id = $1 group by c.status`,
        [charge.id],
      );
      expect(partial.status).toBe("partially_paid");
      expect(partial.paid).toBe("125.00");

      await db.query(
        `update public.financial_payments
            set voided_at = now(), void_reason = 'Baseline F0'
          where id = $1`,
        [payment.id],
      );
      const [afterVoid] = await db.query<{ status: string }>(
        "select status from public.financial_charges where id = $1",
        [charge.id],
      );
      expect(afterVoid.status).toBe("pending");
    } finally {
      await db.close();
    }
  });

  it("pacote pós-pago consome sessão sem criar cobrança avulsa", async () => {
    const patientId = await createPatient(admin, organizationId, {
      name: "Paciente Pós Pago",
      fee: "400.00",
    });
    const db = await openSession({ userId: admin });
    try {
      const [plan] = await db.query<{ id: string }>(
        `insert into public.financial_plans (
           organization_id, patient_id, plan_type, total_sessions, price
         ) values ($1, $2, 'postpaid_package', 4, 1500.00) returning id`,
        [organizationId, patientId],
      );
      const sessionId = await startSession(admin, organizationId, patientId);
      const [result] = await db.query<{ create_session_charge: string | null }>(
        "select public.create_session_charge($1, $2) as create_session_charge",
        [sessionId, organizationId],
      );
      expect(result.create_session_charge).toBeNull();

      const [planState] = await db.query<{ used_sessions: number }>(
        "select used_sessions from public.financial_plans where id = $1",
        [plan.id],
      );
      expect(planState.used_sessions).toBe(1);

      const charges = await db.query(
        "select id from public.financial_charges where session_id = $1",
        [sessionId],
      );
      expect(charges).toEqual([]);
    } finally {
      await db.close();
    }
  });

  it("mensalidade cobre a sessão sem consumir unidade nem criar cobrança avulsa", async () => {
    const patientId = await createPatient(admin, organizationId, {
      name: "Paciente Mensal",
      fee: "350.00",
    });
    const db = await openSession({ userId: admin });
    try {
      const [plan] = await db.query<{ id: string }>(
        `insert into public.financial_plans (
           organization_id, patient_id, plan_type, total_sessions, price
         ) values ($1, $2, 'monthly', null, 1200.00) returning id`,
        [organizationId, patientId],
      );
      const sessionId = await startSession(admin, organizationId, patientId);
      const [result] = await db.query<{ create_session_charge: string | null }>(
        "select public.create_session_charge($1, $2) as create_session_charge",
        [sessionId, organizationId],
      );
      expect(result.create_session_charge).toBeNull();

      const movements = await db.query(
        "select id from public.financial_plan_movements where plan_id = $1 and session_id = $2",
        [plan.id, sessionId],
      );
      expect(movements).toEqual([]);
      const charges = await db.query(
        "select id from public.financial_charges where session_id = $1",
        [sessionId],
      );
      expect(charges).toEqual([]);
    } finally {
      await db.close();
    }
  });

  it("restauração de sessão reduz used_sessions sem apagar o movimento original", async () => {
    const patientId = await createPatient(admin, organizationId, {
      name: "Paciente Restauração",
      fee: "250.00",
    });
    const db = await openSession({ userId: admin });
    try {
      const [plan] = await db.query<{ id: string }>(
        `insert into public.financial_plans (
           organization_id, patient_id, plan_type, total_sessions, price
         ) values ($1, $2, 'prepaid_package', 2, 500.00) returning id`,
        [organizationId, patientId],
      );
      const sessionId = await startSession(admin, organizationId, patientId);
      await db.query("select public.create_session_charge($1, $2)", [sessionId, organizationId]);

      await db.query(
        `insert into public.financial_plan_movements (
           organization_id, plan_id, session_id, movement, delta, reason
         ) values ($1, $2, $3, 'restore', -1, 'Baseline F0')`,
        [organizationId, plan.id, sessionId],
      );
      const [state] = await db.query<{ used_sessions: number }>(
        "select used_sessions from public.financial_plans where id = $1",
        [plan.id],
      );
      expect(state.used_sessions).toBe(0);

      const movements = await db.query<{ movement: string; delta: number }>(
        `select movement, delta from public.financial_plan_movements
          where plan_id = $1 order by created_at, id`,
        [plan.id],
      );
      expect(movements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ movement: "consume", delta: 1 }),
          expect.objectContaining({ movement: "restore", delta: -1 }),
        ]),
      );
    } finally {
      await db.close();
    }
  });

  it("despesa recorrente ainda persiste apenas o marcador, sem gerar lançamentos futuros", async () => {
    const db = await openSession({ userId: admin });
    try {
      const [expense] = await db.query<{ id: string; recurrence: { interval: string } }>(
        `insert into public.financial_expenses (
           organization_id, category, description, amount, due_date, recurrence
         ) values ($1, 'Aluguel', 'Baseline recorrência', 1000.00, '2026-09-10', '{"interval":"monthly"}'::jsonb)
         returning id, recurrence`,
        [organizationId],
      );
      expect(expense.recurrence).toEqual({ interval: "monthly" });

      const [count] = await db.query<{ count: string }>(
        `select count(*)::text as count from public.financial_expenses
          where organization_id = $1 and description = 'Baseline recorrência'`,
        [organizationId],
      );
      expect(count.count).toBe("1");
    } finally {
      await db.close();
    }
  });

  it("F1: competência fechada bloqueia novos fatos de competência, mas permite recebimento posterior", async () => {
    const patientId = await createPatient(admin, organizationId, {
      name: "Paciente Recebimento Tardio",
    });
    const db = await openSession({ userId: admin });
    try {
      const [charge] = await db.query<{ id: string }>(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount, due_date, competence_date
         ) values ($1, $2, 'session', 'Competência antiga', 200.00, '2026-06-30', '2026-06-20')
         returning id`,
        [organizationId, patientId],
      );
      await db.query(
        `insert into public.financial_closings (
           organization_id, period_start, period_end, status, closed_at, totals_snapshot
         ) values ($1, '2026-06-01', '2026-06-30', 'closed', now(), '{}'::jsonb)`,
        [organizationId],
      );

      const chargeError = await db.expectError(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount, competence_date
         ) values ($1, $2, 'administrative', 'Retroativo proibido', 10.00, '2026-06-25')`,
        [organizationId, patientId],
      );
      expect(chargeError).toMatch(/period is closed/i);

      const [payment] = await db.query<{ id: string; paid_at: string }>(
        `insert into public.financial_payments (
           organization_id, charge_id, amount, method, paid_at
         ) values ($1, $2, 200.00, 'pix', '2026-07-05T12:00:00Z')
         returning id, paid_at::text as paid_at`,
        [organizationId, charge.id],
      );
      expect(payment.id).toBeTruthy();

      const [state] = await db.query<{ status: string; paid: string }>(
        `select c.status, coalesce(sum(p.amount) filter (where p.voided_at is null), 0)::text as paid
           from public.financial_charges c
           left join public.financial_payments p on p.charge_id = c.id
          where c.id = $1 group by c.status`,
        [charge.id],
      );
      expect(state.status).toBe("paid");
      expect(state.paid).toBe("200.00");
    } finally {
      await db.close();
    }
  });

  it("F1: competência da sessão respeita o timezone configurado da organização", async () => {
    const patientId = await createPatient(admin, organizationId, {
      name: "Paciente Timezone",
      fee: "300.00",
    });
    const db = await openSession({ userId: admin });
    try {
      await db.query(
        "update public.organizations set timezone = 'America/Sao_Paulo' where id = $1",
        [organizationId],
      );
      const sessionId = await startSession(admin, organizationId, patientId);
      await db.query(
        `update public.clinical_sessions
            set started_at = '2026-09-06T01:30:00Z'
          where id = $1`,
        [sessionId],
      );

      const [result] = await db.query<{ create_session_charge: string }>(
        "select public.create_session_charge($1, $2) as create_session_charge",
        [sessionId, organizationId],
      );
      expect(result.create_session_charge).toBeTruthy();

      const [charge] = await db.query<{ competence_date: string }>(
        "select competence_date::text as competence_date from public.financial_charges where id = $1",
        [result.create_session_charge],
      );
      // 01:30 UTC is still 22:30 on the previous local day in São Paulo/Goiânia.
      expect(charge.competence_date).toBe("2026-09-05");
    } finally {
      await db.close();
    }
  });
});
