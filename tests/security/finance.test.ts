import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
  setSecretaryFinanceAccess,
} from "./support/db";

async function createPatient(
  actorUserId: string,
  organizationId: string,
  extras: { name?: string; fee?: string } = {},
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.patients (
         organization_id, preferred_name, full_name, birth_date, default_session_value
       ) values ($1, $2, $2, '1990-05-10', $3) returning id`,
      [organizationId, extras.name ?? "Paciente Financeiro", extras.fee ?? null],
    );
    return rows[0].id;
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
    const rows = await session.query<{ start_clinical_session: string }>(
      "select public.start_clinical_session($1, $2) as start_clinical_session",
      [organizationId, patientId],
    );
    return rows[0].start_clinical_session;
  } finally {
    await session.close();
  }
}

async function insertCharge(
  actorUserId: string,
  organizationId: string,
  values: {
    patientId?: string | null;
    sessionId?: string | null;
    amount: string;
    description?: string;
    origin?: string;
    dueDate?: string | null;
    competenceDate?: string;
    idempotencyKey?: string | null;
  },
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.financial_charges (
         organization_id, patient_id, session_id, origin, description, amount,
         due_date, competence_date, idempotency_key
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        organizationId,
        values.patientId ?? null,
        values.sessionId ?? null,
        values.origin ?? "administrative",
        values.description ?? "Cobrança de teste",
        values.amount,
        values.dueDate ?? "2026-08-25",
        values.competenceDate ?? "2026-08-20",
        values.idempotencyKey ?? null,
      ],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

describe("financeiro — secretary_finance_access none/view/manage e sem hard delete", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Financeiro RLS");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId, { fee: "150.00" });
  });

  it("none: secretária não lê nem escreve cobranças", async () => {
    await setSecretaryFinanceAccess(admin, organizationId, "none");
    const chargeId = await insertCharge(admin, organizationId, {
      patientId,
      amount: "80.00",
      description: "Visível só com acesso",
    });

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query(
        "select id from public.financial_charges where id = $1",
        [chargeId],
      );
      expect(rows).toEqual([]);

      const error = await session.expectError(
        `insert into public.financial_charges (
           organization_id, patient_id, origin, description, amount, competence_date
         ) values ($1, $2, 'administrative', 'Tentativa da secretaria', 10.00, '2026-08-20')`,
        [organizationId, patientId],
      );
      expect(error).toMatch(/row-level security|not authorized/i);
    } finally {
      await session.close();
    }
  });

  it("view: secretária lê e não escreve", async () => {
    await setSecretaryFinanceAccess(admin, organizationId, "view");
    const chargeId = await insertCharge(admin, organizationId, {
      patientId,
      amount: "90.00",
      description: "Leitura da secretaria",
    });

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query<{ id: string }>(
        "select id from public.financial_charges where id = $1",
        [chargeId],
      );
      expect(rows).toHaveLength(1);

      const insertError = await session.expectError(
        `insert into public.financial_payments (organization_id, charge_id, amount, method)
         values ($1, $2, 10.00, 'pix')`,
        [organizationId, chargeId],
      );
      expect(insertError).toMatch(/row-level security/i);

      const updateError = await session.expectError(
        `update public.financial_charges set description = 'hack' where id = $1 returning id`,
        [chargeId],
      );
      expect(updateError).toMatch(/row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("manage: secretária registra pagamento e não apaga o fato", async () => {
    await setSecretaryFinanceAccess(admin, organizationId, "manage");
    const chargeId = await insertCharge(admin, organizationId, {
      patientId,
      amount: "100.00",
      description: "Baixa pela secretaria",
    });

    const session = await openSession({ userId: secretary });
    try {
      const payments = await session.query<{ id: string; amount: string }>(
        `insert into public.financial_payments (organization_id, charge_id, amount, method)
         values ($1, $2, 40.00, 'pix') returning id, amount::text as amount`,
        [organizationId, chargeId],
      );
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe("40.00");

      const status = await session.query<{ status: string }>(
        "select status from public.financial_charges where id = $1",
        [chargeId],
      );
      expect(status[0].status).toBe("partially_paid");

      const deleteError = await session.expectError(
        "delete from public.financial_payments where id = $1",
        [payments[0].id],
      );
      expect(deleteError).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("admin também não tem GRANT de DELETE em fatos financeiros", async () => {
    const chargeId = await insertCharge(admin, organizationId, {
      patientId,
      amount: "50.00",
      description: "Não apagar",
    });
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "delete from public.financial_charges where id = $1",
        [chargeId],
      );
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });
});

describe("financeiro — isolamento, idempotência, saldo e período fechado", () => {
  let adminA: string;
  let adminB: string;
  let orgA: string;
  let orgB: string;
  let patientA: string;

  beforeAll(async () => {
    adminA = await createAuthUser();
    adminB = await createAuthUser();
    orgA = await bootstrapOrganization(adminA, "Consultório A Financeiro");
    orgB = await bootstrapOrganization(adminB, "Consultório B Financeiro");
    patientA = await createPatient(adminA, orgA, { name: "Paciente A", fee: "200.00" });
  });

  it("membro de B não lê cobrança de A mesmo com UUID direto", async () => {
    const chargeId = await insertCharge(adminA, orgA, {
      patientId: patientA,
      amount: "200.00",
      description: "Só do tenant A",
    });
    const session = await openSession({ userId: adminB });
    try {
      const rows = await session.query(
        "select id from public.financial_charges where id = $1",
        [chargeId],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("finalizar sessão duas vezes não duplica a cobrança", async () => {
    const patientId = await createPatient(adminA, orgA, {
      name: "Paciente Sessão Cobrança",
      fee: "180.00",
    });
    const sessionId = await startSession(adminA, orgA, patientId);
    const db = await openSession({ userId: adminA });
    try {
      const first = await db.query<{ create_session_charge: string }>(
        "select public.create_session_charge($1, $2) as create_session_charge",
        [sessionId, orgA],
      );
      const second = await db.query<{ create_session_charge: string }>(
        "select public.create_session_charge($1, $2) as create_session_charge",
        [sessionId, orgA],
      );
      expect(first[0].create_session_charge).toBeTruthy();
      expect(second[0].create_session_charge).toBe(first[0].create_session_charge);

      const count = await db.query<{ count: string }>(
        `select count(*)::text as count from public.financial_charges
         where organization_id = $1 and session_id = $2`,
        [orgA, sessionId],
      );
      expect(count[0].count).toBe("1");
    } finally {
      await db.close();
    }
  });

  it("pagamento duplicado com a mesma idempotency_key é rejeitado", async () => {
    const chargeId = await insertCharge(adminA, orgA, {
      patientId: patientA,
      amount: "70.00",
      description: "Idempotência de pagamento",
    });
    const key = "11111111-1111-4111-8111-111111111111";
    const session = await openSession({ userId: adminA });
    try {
      await session.query(
        `insert into public.financial_payments (
           organization_id, charge_id, amount, method, idempotency_key
         ) values ($1, $2, 20.00, 'pix', $3)`,
        [orgA, chargeId, key],
      );
      const error = await session.expectError(
        `insert into public.financial_payments (
           organization_id, charge_id, amount, method, idempotency_key
         ) values ($1, $2, 20.00, 'pix', $3)`,
        [orgA, chargeId, key],
      );
      expect(error).toMatch(/duplicate key|unique/i);
    } finally {
      await session.close();
    }
  });

  it("pagamento acima do restante é recusado e 0,10+0,20 fecha 0,30 sem float", async () => {
    const chargeId = await insertCharge(adminA, orgA, {
      patientId: patientA,
      amount: "0.30",
      description: "Centavos",
    });
    const session = await openSession({ userId: adminA });
    try {
      await session.query(
        `insert into public.financial_payments (organization_id, charge_id, amount, method)
         values ($1, $2, 0.10, 'cash')`,
        [orgA, chargeId],
      );
      await session.query(
        `insert into public.financial_payments (organization_id, charge_id, amount, method)
         values ($1, $2, 0.20, 'cash')`,
        [orgA, chargeId],
      );
      const paid = await session.query<{ status: string; paid: string }>(
        `select c.status, coalesce(sum(p.amount), 0)::text as paid
           from public.financial_charges c
           left join public.financial_payments p
             on p.charge_id = c.id and p.voided_at is null
          where c.id = $1
          group by c.status`,
        [chargeId],
      );
      expect(paid[0].paid).toBe("0.30");
      expect(paid[0].status).toBe("paid");

      const over = await session.expectError(
        `insert into public.financial_payments (organization_id, charge_id, amount, method)
         values ($1, $2, 0.01, 'cash')`,
        [orgA, chargeId],
      );
      expect(over).toMatch(/exceeds remaining/i);
    } finally {
      await session.close();
    }
  });

  it("período fechado bloqueia novo lançamento na competência", async () => {
    const session = await openSession({ userId: adminA });
    try {
      await session.query(
        `insert into public.financial_closings (
           organization_id, period_start, period_end, status, closed_at, totals_snapshot
         ) values ($1, '2026-07-01', '2026-07-31', 'closed', now(), '{}'::jsonb)`,
        [orgA],
      );
      const error = await session.expectError(
        `insert into public.financial_charges (
           organization_id, origin, description, amount, competence_date
         ) values ($1, 'administrative', 'Dentro do fechado', 10.00, '2026-07-15')`,
        [orgA],
      );
      expect(error).toMatch(/period is closed/i);
    } finally {
      await session.close();
    }
  });

  it("estorno de pagamento é void auditável, nunca delete", async () => {
    const chargeId = await insertCharge(adminA, orgA, {
      patientId: patientA,
      amount: "60.00",
      description: "Para estornar",
    });
    const session = await openSession({ userId: adminA });
    try {
      const [payment] = await session.query<{ id: string }>(
        `insert into public.financial_payments (organization_id, charge_id, amount, method)
         values ($1, $2, 60.00, 'pix') returning id`,
        [orgA, chargeId],
      );
      await session.query(
        `update public.financial_payments
            set voided_at = now(), void_reason = 'teste'
          where id = $1`,
        [payment.id],
      );
      const rows = await session.query<{ status: string; voided: string | null }>(
        `select c.status, p.voided_at::text as voided
           from public.financial_charges c
           join public.financial_payments p on p.charge_id = c.id
          where p.id = $1`,
        [payment.id],
      );
      expect(rows[0].voided).toBeTruthy();
      expect(rows[0].status).toBe("pending");
    } finally {
      await session.close();
    }
  });

  it("pacote pré-pago consome sessão em vez de gerar cobrança avulsa", async () => {
    const patientId = await createPatient(adminA, orgA, {
      name: "Paciente Pacote",
      fee: "150.00",
    });
    const db = await openSession({ userId: adminA });
    try {
      const [plan] = await db.query<{ id: string }>(
        `insert into public.financial_plans (
           organization_id, patient_id, plan_type, total_sessions, price
         ) values ($1, $2, 'prepaid_package', 4, 600.00) returning id`,
        [orgA, patientId],
      );
      const sessionId = await startSession(adminA, orgA, patientId);
      const chargeId = await db.query<{ create_session_charge: string | null }>(
        "select public.create_session_charge($1, $2) as create_session_charge",
        [sessionId, orgA],
      );
      expect(chargeId[0].create_session_charge).toBeNull();

      const planRow = await db.query<{ used_sessions: number; status: string }>(
        "select used_sessions, status from public.financial_plans where id = $1",
        [plan.id],
      );
      expect(planRow[0].used_sessions).toBe(1);
      expect(planRow[0].status).toBe("active");

      const movements = await db.query(
        `select id from public.financial_plan_movements
          where plan_id = $1 and session_id = $2 and movement = 'consume'`,
        [plan.id, sessionId],
      );
      expect(movements).toHaveLength(1);

      const again = await db.query<{ create_session_charge: string | null }>(
        "select public.create_session_charge($1, $2) as create_session_charge",
        [sessionId, orgA],
      );
      expect(again[0].create_session_charge).toBeNull();
      const consumeCount = await db.query<{ count: string }>(
        `select count(*)::text as count from public.financial_plan_movements
          where session_id = $1 and movement = 'consume'`,
        [sessionId],
      );
      expect(consumeCount[0].count).toBe("1");
    } finally {
      await db.close();
    }
  });
});
