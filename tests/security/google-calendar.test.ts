import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

async function connectGoogle(
  adminUserId: string,
  organizationId: string,
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    email: string;
  }> = {},
) {
  const session = await openSession({ userId: adminUserId });
  try {
    await session.query(
      `select public.upsert_google_credentials($1, $2, now() + interval '1 hour', $3, $4, array['https://www.googleapis.com/auth/calendar'])`,
      [
        organizationId,
        overrides.accessToken ?? `enc-access-token:${organizationId}`,
        overrides.refreshToken ?? `enc-refresh-token:${organizationId}`,
        overrides.email ?? "consultorio@example.com",
      ],
    );
  } finally {
    await session.close();
  }
}

async function insertManagedAppointment(
  actorUserId: string,
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.appointments (organization_id, starts_at, ends_at, create_idempotency_key)
       values ($1, now() + interval '1 day', now() + interval '1 day 50 minutes', $2)
       returning id`,
      [organizationId, overrides.idempotencyKey ?? randomUUID()],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

describe("google_calendar_credentials — nunca exposto via Data API", () => {
  it("ninguém tem GRANT direto na tabela, nem o admin que conectou", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Google");
    await connectGoogle(admin, organizationId);

    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "select refresh_token_encrypted from public.google_calendar_credentials where organization_id = $1",
        [organizationId],
      );
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("secretária não conecta nem desconecta o Google Calendar", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Papéis Google");
    await addMember(admin, organizationId, secretary, "secretary");

    const session = await openSession({ userId: secretary });
    try {
      const error = await session.expectError(
        `select public.upsert_google_credentials($1, 'x', now(), 'y')`,
        [organizationId],
      );
      expect(error).toMatch(/only psychologist_admin/i);
    } finally {
      await session.close();
    }

    await connectGoogle(admin, organizationId);

    const secretarySession = await openSession({ userId: secretary });
    try {
      const error = await secretarySession.expectError(
        "select public.disconnect_google_calendar($1)",
        [organizationId],
      );
      expect(error).toMatch(/only psychologist_admin/i);
    } finally {
      await secretarySession.close();
    }
  });

  it("get_google_credentials só retorna dados para membro da própria organização", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Refresh");
    await connectGoogle(admin, organizationId, {
      refreshToken: `enc-secret-refresh:${organizationId}`,
    });

    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ refresh_token_encrypted: string }>(
        "select * from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(rows[0].refresh_token_encrypted).toBe(`enc-secret-refresh:${organizationId}`);
    } finally {
      await session.close();
    }

    const outsider = await createAuthUser();
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const rows = await outsiderSession.query(
        "select * from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(rows).toEqual([]);
    } finally {
      await outsiderSession.close();
    }
  });

  it("disconnect remove as credenciais e volta o status para disconnected", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Disconnect");
    await connectGoogle(admin, organizationId);

    const session = await openSession({ userId: admin });
    try {
      const before = await session.query<{ status: string }>(
        "select status from public.google_calendar_connections where organization_id = $1",
        [organizationId],
      );
      expect(before[0].status).toBe("connected");

      await session.query("select public.disconnect_google_calendar($1)", [
        organizationId,
      ]);

      const after = await session.query<{ status: string; calendar_id: string | null }>(
        "select status, calendar_id from public.google_calendar_connections where organization_id = $1",
        [organizationId],
      );
      expect(after[0].status).toBe("disconnected");
      expect(after[0].calendar_id).toBeNull();

      const credentials = await session.query(
        "select * from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(credentials).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não conecta nem lê credenciais de A", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório A Google");
    const otherAdmin = await createAuthUser();
    await bootstrapOrganization(otherAdmin, "Consultório B Google");

    const session = await openSession({ userId: otherAdmin });
    try {
      const error = await session.expectError(
        `select public.upsert_google_credentials($1, 'x', now(), 'y')`,
        [organizationId],
      );
      expect(error).toMatch(/only psychologist_admin/i);

      const creds = await session.query(
        "select * from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(creds).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("google_calendar_credentials não tem policy nem GRANT para authenticated/anon", async () => {
    const session = await openSession({ userId: await createAuthUser() });
    try {
      const policies = await session.query<{ count: string }>(
        `select count(*)::text as count
         from pg_policies
         where schemaname = 'public'
           and tablename = 'google_calendar_credentials'`,
      );
      expect(policies[0].count).toBe("0");

      const grants = await session.query<{ has_select: boolean; has_insert: boolean }>(
        `select
           has_table_privilege('authenticated', 'public.google_calendar_credentials', 'SELECT') as has_select,
           has_table_privilege('authenticated', 'public.google_calendar_credentials', 'INSERT') as has_insert`,
      );
      expect(grants[0].has_select).toBe(false);
      expect(grants[0].has_insert).toBe(false);

      const anonGrants = await session.query<{ has_select: boolean }>(
        `select has_table_privilege('anon', 'public.google_calendar_credentials', 'SELECT') as has_select`,
      );
      expect(anonGrants[0].has_select).toBe(false);
    } finally {
      await session.close();
    }
  });

  it("multi-membership não lê nem copia tokens da outra clínica via RPC", async () => {
    const adminA = await createAuthUser();
    const adminB = await createAuthUser();
    const shared = await createAuthUser();
    const orgA = await bootstrapOrganization(adminA, "Multi Google A");
    const orgB = await bootstrapOrganization(adminB, "Multi Google B");
    await addMember(adminA, orgA, shared, "psychologist_admin");
    await addMember(adminB, orgB, shared, "secretary");
    await connectGoogle(adminA, orgA, {
      accessToken: "enc-access-org-a",
      refreshToken: "enc-token-org-a",
    });
    await connectGoogle(adminB, orgB, {
      accessToken: "enc-access-org-b",
      refreshToken: "enc-token-org-b",
    });

    const session = await openSession({ userId: shared });
    try {
      const fromA = await session.query<{ refresh_token_encrypted: string }>(
        "select refresh_token_encrypted from public.get_google_credentials($1)",
        [orgA],
      );
      expect(fromA[0].refresh_token_encrypted).toBe("enc-token-org-a");

      const fromB = await session.query<{ refresh_token_encrypted: string }>(
        "select refresh_token_encrypted from public.get_google_credentials($1)",
        [orgB],
      );
      expect(fromB[0].refresh_token_encrypted).toBe("enc-token-org-b");

      const secretaryCopy = await session.expectError(
        `select public.upsert_google_credentials($1, 'stolen-access', now(), $2, 'stolen@example.com')`,
        [orgB, fromA[0].refresh_token_encrypted],
      );
      expect(secretaryCopy).toMatch(/psychologist_admin|cannot copy google credentials/i);

      const stillB = await session.query<{ refresh_token_encrypted: string }>(
        "select refresh_token_encrypted from public.get_google_credentials($1)",
        [orgB],
      );
      expect(stillB[0].refresh_token_encrypted).toBe("enc-token-org-b");
    } finally {
      await session.close();
    }

    const dualAdmin = await createAuthUser();
    await addMember(adminA, orgA, dualAdmin, "psychologist_admin");
    await addMember(adminB, orgB, dualAdmin, "psychologist_admin");
    const dualSession = await openSession({ userId: dualAdmin });
    try {
      const stolen = await dualSession.query<{
        access_token_encrypted: string;
        refresh_token_encrypted: string;
      }>("select * from public.get_google_credentials($1)", [orgA]);

      const copyError = await dualSession.expectError(
        `select public.upsert_google_credentials($1, $2, now(), $3)`,
        [
          orgB,
          stolen[0].access_token_encrypted,
          stolen[0].refresh_token_encrypted,
        ],
      );
      expect(copyError).toMatch(/cannot copy google credentials/i);

      const unchanged = await dualSession.query<{ refresh_token_encrypted: string }>(
        "select refresh_token_encrypted from public.get_google_credentials($1)",
        [orgB],
      );
      expect(unchanged[0].refresh_token_encrypted).toBe("enc-token-org-b");
    } finally {
      await dualSession.close();
    }
  });
});

describe("google_calendar_connections — leitura ampla, escrita restrita", () => {
  it("secretária lê o status da conexão e não altera o calendário selecionado", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Seleção");
    await addMember(admin, organizationId, secretary, "secretary");
    await connectGoogle(admin, organizationId);

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query<{ status: string }>(
        "select status from public.google_calendar_connections where organization_id = $1",
        [organizationId],
      );
      expect(rows[0].status).toBe("connected");

      const updated = await session.query<{ calendar_id: string }>(
        "update public.google_calendar_connections set calendar_id = $2 where organization_id = $1 returning calendar_id",
        [organizationId, "primary"],
      );
      expect(updated).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não lê nem altera a conexão de A", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Isolado Google");
    await connectGoogle(admin, organizationId);

    const outsider = await createAuthUser();
    const session = await openSession({ userId: outsider });
    try {
      const rows = await session.query(
        "select organization_id from public.google_calendar_connections where organization_id = $1",
        [organizationId],
      );
      expect(rows).toEqual([]);

      const updated = await session.query(
        "update public.google_calendar_connections set calendar_id = 'hack' where organization_id = $1 returning organization_id",
        [organizationId],
      );
      expect(updated).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("admin da própria organização seleciona o calendar_id", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Admin Calendário");
    await connectGoogle(admin, organizationId);

    const session = await openSession({ userId: admin });
    try {
      const updated = await session.query<{ calendar_id: string }>(
        "update public.google_calendar_connections set calendar_id = $2 where organization_id = $1 returning calendar_id",
        [organizationId, "primary"],
      );
      expect(updated[0].calendar_id).toBe("primary");
    } finally {
      await session.close();
    }
  });

  it("dual-admin não move a conexão de A para B", async () => {
    const adminA = await createAuthUser();
    const adminB = await createAuthUser();
    const orgA = await bootstrapOrganization(adminA, "Conexão Tenant A");
    const orgB = await bootstrapOrganization(adminB, "Conexão Tenant B");
    await addMember(adminA, orgA, adminB, "psychologist_admin");
    await connectGoogle(adminA, orgA);

    const session = await openSession({ userId: adminB });
    try {
      const moved = await session.query<{ organization_id: string }>(
        "update public.google_calendar_connections set organization_id = $2 where organization_id = $1 returning organization_id",
        [orgA, orgB],
      );
      expect(moved.map((row) => row.organization_id)).toEqual([orgA]);

      const inB = await session.query(
        "select organization_id from public.google_calendar_connections where organization_id = $1",
        [orgB],
      );
      expect(inB).toEqual([]);
    } finally {
      await session.close();
    }
  });
});

describe("appointments — eventos externos são somente leitura", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Agenda");
    await addMember(admin, organizationId, secretary, "secretary");
  });

  it("admin e secretária têm CRUD em eventos gerenciados (TESSELI)", async () => {
    for (const actor of [admin, secretary]) {
      const session = await openSession({ userId: actor });
      try {
        const inserted = await session.query<{ id: string; origin: string }>(
          `insert into public.appointments (organization_id, starts_at, ends_at, create_idempotency_key)
           values ($1, now() + interval '2 day', now() + interval '2 day 50 minutes', $2)
           returning id, origin`,
          [organizationId, randomUUID()],
        );
        expect(inserted[0].origin).toBe("TESSELI");

        const updated = await session.query<{ status: string }>(
          "update public.appointments set status = 'confirmed' where id = $1 returning status",
          [inserted[0].id],
        );
        expect(updated[0].status).toBe("confirmed");

        const deleted = await session.query<{ id: string }>(
          "delete from public.appointments where id = $1 returning id",
          [inserted[0].id],
        );
        expect(deleted).toHaveLength(1);
      } finally {
        await session.close();
      }
    }
  });

  it("ninguém insere um evento GOOGLE_EXTERNAL por escrita direta", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.appointments (organization_id, starts_at, ends_at, origin, sync_policy, managed_by_tesseli, google_calendar_id, google_event_id)
         values ($1, now(), now() + interval '1 hour', 'GOOGLE_EXTERNAL', 'read_only', false, 'primary', 'forged-event')`,
        [organizationId],
      );
      expect(error).toMatch(/violates row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("evento externo (pull-sync) não pode ser editado nem apagado por nenhum papel", async () => {
    const session = await openSession({ userId: admin });
    let externalId = "";
    try {
      const rows = await session.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-evt-1', 'etag-1',
           now() + interval '3 day', now() + interval '3 day 1 hour',
           'Evento externo do Google'
         ) as upsert_external_appointment`,
        [organizationId],
      );
      externalId = rows[0].upsert_external_appointment;
      expect(externalId).toBeTruthy();
    } finally {
      await session.close();
    }

    for (const actor of [admin, secretary]) {
      const session = await openSession({ userId: actor });
      try {
        const updated = await session.query(
          "update public.appointments set status = 'cancelled' where id = $1 returning id",
          [externalId],
        );
        expect(updated).toEqual([]);

        const deleted = await session.query(
          "delete from public.appointments where id = $1 returning id",
          [externalId],
        );
        expect(deleted).toEqual([]);
      } finally {
        await session.close();
      }
    }

    // A leitura continua permitida — só a escrita direta é bloqueada.
    const readSession = await openSession({ userId: secretary });
    try {
      const rows = await readSession.query<{ origin: string; sync_policy: string }>(
        "select origin, sync_policy from public.appointments where id = $1",
        [externalId],
      );
      expect(rows[0]).toEqual({ origin: "GOOGLE_EXTERNAL", sync_policy: "read_only" });
    } finally {
      await readSession.close();
    }
  });

  it("upsert_external_appointment é idempotente por (organization_id, calendar_id, event_id)", async () => {
    const session = await openSession({ userId: admin });
    try {
      const first = await session.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment($1, 'primary', 'ext-evt-2', 'etag-a', now(), now() + interval '30 min', 'Primeira versão') as upsert_external_appointment`,
        [organizationId],
      );
      const second = await session.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment($1, 'primary', 'ext-evt-2', 'etag-b', now() + interval '10 min', now() + interval '40 min', 'Segunda versão') as upsert_external_appointment`,
        [organizationId],
      );

      expect(second[0].upsert_external_appointment).toBe(
        first[0].upsert_external_appointment,
      );

      const count = await session.query<{ count: string }>(
        "select count(*)::text as count from public.appointments where organization_id = $1 and google_event_id = 'ext-evt-2'",
        [organizationId],
      );
      expect(count[0].count).toBe("1");

      const stored = await session.query<{ google_etag: string; summary_snapshot: string }>(
        "select google_etag, summary_snapshot from public.appointments where organization_id = $1 and google_event_id = 'ext-evt-2'",
        [organizationId],
      );
      expect(stored[0]).toEqual({
        google_etag: "etag-b",
        summary_snapshot: "Segunda versão",
      });
    } finally {
      await session.close();
    }
  });

  it("cancelamento no Google não move o horário local do evento externo", async () => {
    const session = await openSession({ userId: admin });
    try {
      const inserted = await session.query<{
        upsert_external_appointment: string;
      }>(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-evt-keep-time', 'etag-1',
           '2026-09-01T12:00:00Z', '2026-09-01T13:00:00Z',
           'Evento com horário'
         ) as upsert_external_appointment`,
        [organizationId],
      );

      await session.query(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-evt-keep-time', 'etag-2',
           '1970-01-01T00:00:00Z', '1970-01-01T00:01:00Z',
           'Evento com horário', 'cancelled'
         )`,
        [organizationId],
      );

      const stored = await session.query<{
        status: string;
        starts_at: string;
        ends_at: string;
      }>(
        `select status, starts_at::text, ends_at::text
         from public.appointments
         where id = $1`,
        [inserted[0].upsert_external_appointment],
      );
      expect(stored[0].status).toBe("cancelled");
      expect(stored[0].starts_at).toContain("2026-09-01");
      expect(stored[0].ends_at).toContain("2026-09-01");
    } finally {
      await session.close();
    }
  });

  it("create_idempotency_key impede duplicidade de agendamento por retry", async () => {
    const key = randomUUID();
    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `insert into public.appointments (organization_id, starts_at, ends_at, create_idempotency_key)
         values ($1, now() + interval '5 day', now() + interval '5 day 50 minutes', $2)`,
        [organizationId, key],
      );

      const error = await session.expectError(
        `insert into public.appointments (organization_id, starts_at, ends_at, create_idempotency_key)
         values ($1, now() + interval '5 day', now() + interval '5 day 50 minutes', $2)`,
        [organizationId, key],
      );
      expect(error).toMatch(/duplicate key|unique/i);
    } finally {
      await session.close();
    }
  });

  it("paciente do agendamento precisa ser da mesma organização", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Consultório Paciente Errado");
    const otherPatientSession = await openSession({ userId: otherAdmin });
    let otherPatientId = "";
    try {
      const rows = await otherPatientSession.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name)
         values ($1, 'Paciente Errado', 'Paciente Errado') returning id`,
        [otherOrg],
      );
      otherPatientId = rows[0].id;
    } finally {
      await otherPatientSession.close();
    }

    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.appointments (organization_id, patient_id, starts_at, ends_at, create_idempotency_key)
         values ($1, $2, now() + interval '6 day', now() + interval '6 day 50 minutes', $3)`,
        [organizationId, otherPatientId, randomUUID()],
      );
      expect(error).toMatch(/same organization/i);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não lê nem escreve agendamentos de A", async () => {
    const appointmentId = await insertManagedAppointment(admin, organizationId);
    const outsider = await createAuthUser();
    const session = await openSession({ userId: outsider });
    try {
      const read = await session.query(
        "select id from public.appointments where id = $1",
        [appointmentId],
      );
      expect(read).toEqual([]);

      const write = await session.query(
        "update public.appointments set status = 'cancelled' where id = $1 returning id",
        [appointmentId],
      );
      expect(write).toEqual([]);

      const upsertError = await session.expectError(
        `select public.upsert_external_appointment($1, 'primary', 'stolen-evt', 'etag', now(), now() + interval '30 min', 'Invasão')`,
        [organizationId],
      );
      expect(upsertError).toMatch(/active membership/i);
    } finally {
      await session.close();
    }
  });

  it("não existe unique (organization_id, google_event_id) isolado", async () => {
    const session = await openSession({ userId: admin });
    try {
      const constraints = await session.query<{
        conname: string;
        columns: string[];
      }>(
        `select c.conname, array_agg(a.attname order by x.ordinality) as columns
         from pg_constraint c
         join lateral unnest(c.conkey) with ordinality as x(attnum, ordinality) on true
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum
         where c.conrelid = 'public.appointments'::regclass
           and c.contype = 'u'
         group by c.conname`,
      );
      expect(
        constraints.some(
          (row) =>
            row.columns.length === 2 &&
            row.columns.includes("organization_id") &&
            row.columns.includes("google_event_id"),
        ),
      ).toBe(false);
      expect(
        constraints.some(
          (row) =>
            row.conname === "appointments_google_event_unique" &&
            row.columns.includes("google_calendar_id"),
        ),
      ).toBe(true);
    } finally {
      await session.close();
    }
  });
});

describe("isolamento de tenant no Google Calendar", () => {
  it("dual-admin não move um agendamento TESSELI de A para B", async () => {
    const adminA = await createAuthUser();
    const adminB = await createAuthUser();
    const orgA = await bootstrapOrganization(adminA, "Agenda Tenant A");
    const orgB = await bootstrapOrganization(adminB, "Agenda Tenant B");
    await addMember(adminA, orgA, adminB, "psychologist_admin");
    const appointmentId = await insertManagedAppointment(adminA, orgA);

    const session = await openSession({ userId: adminB });
    try {
      const moved = await session.query<{ organization_id: string }>(
        `update public.appointments
         set organization_id = $2, patient_id = null
         where id = $1
         returning organization_id`,
        [appointmentId, orgB],
      );
      expect(moved[0].organization_id).toBe(orgA);

      const inB = await session.query(
        "select id from public.appointments where id = $1 and organization_id = $2",
        [appointmentId, orgB],
      );
      expect(inB).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("disconnect remove tokens e não apaga pacientes nem consultas", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Disconnect Preserva");
    await connectGoogle(admin, organizationId);

    const session = await openSession({ userId: admin });
    try {
      const patient = await session.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name)
         values ($1, 'Paciente Keep', 'Paciente Keep') returning id`,
        [organizationId],
      );
      const appointment = await session.query<{ id: string }>(
        `insert into public.appointments (organization_id, patient_id, starts_at, ends_at, create_idempotency_key)
         values ($1, $2, now() + interval '8 day', now() + interval '8 day 50 minutes', $3)
         returning id`,
        [organizationId, patient[0].id, randomUUID()],
      );

      await session.query("select public.disconnect_google_calendar($1)", [
        organizationId,
      ]);

      const credentials = await session.query(
        "select * from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(credentials).toEqual([]);

      const keptPatient = await session.query(
        "select id from public.patients where id = $1",
        [patient[0].id],
      );
      expect(keptPatient).toHaveLength(1);

      const keptAppointment = await session.query(
        "select id from public.appointments where id = $1",
        [appointment[0].id],
      );
      expect(keptAppointment).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it("mark_google_connection_error exige membership e não vaza token", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Mark Error");
    await connectGoogle(admin, organizationId, {
      refreshToken: `enc-secret-refresh:${organizationId}`,
    });

    const outsider = await createAuthUser();
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const error = await outsiderSession.expectError(
        "select public.mark_google_connection_error($1, 'ya29.stolen-access-token')",
        [organizationId],
      );
      expect(error).toMatch(/active membership/i);
    } finally {
      await outsiderSession.close();
    }

    const session = await openSession({ userId: admin });
    try {
      await session.query(
        "select public.mark_google_connection_error($1, $2)",
        [
          organizationId,
          "token refresh failed bearer ya29.abcdefghijklmnopqrstuvwxyz refresh_token=1//0secretblob",
        ],
      );

      const rows = await session.query<{
        status: string;
        last_sync_error: string;
      }>(
        "select status, last_sync_error from public.google_calendar_connections where organization_id = $1",
        [organizationId],
      );
      expect(rows[0].status).toBe("error");
      expect(rows[0].last_sync_error).not.toMatch(/ya29\./i);
      expect(rows[0].last_sync_error).not.toMatch(/1\/\//);
      expect(rows[0].last_sync_error).not.toMatch(/enc-secret-refresh/);
      expect(rows[0].last_sync_error).toMatch(/\[redacted\]/i);

      const credentials = await session.query<{ refresh_token_encrypted: string }>(
        "select refresh_token_encrypted from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(credentials[0].refresh_token_encrypted).toBe(
        `enc-secret-refresh:${organizationId}`,
      );
    } finally {
      await session.close();
    }
  });

  it("sessão anônima não executa RPCs nem lê a conexão", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Anon Google");
    await connectGoogle(admin, organizationId);

    const anon = await openSession();
    try {
      const selectError = await anon.expectError(
        "select organization_id from public.google_calendar_connections where organization_id = $1",
        [organizationId],
      );
      expect(selectError).toMatch(/permission denied/i);

      for (const sql of [
        "select public.get_google_credentials($1)",
        "select public.upsert_google_credentials($1, 'x', now(), 'y')",
        "select public.disconnect_google_calendar($1)",
        "select public.mark_google_connection_error($1, 'x')",
      ]) {
        const error = await anon.expectError(sql, [organizationId]);
        expect(error).toMatch(/permission denied/i);
      }
    } finally {
      await anon.close();
    }
  });
});

describe("calendar_sync_events — auditoria sem escrita direta", () => {
  it("secretária não lê a auditoria de sync, mas pode gerá-la", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Sync Audit");
    await addMember(admin, organizationId, secretary, "secretary");

    const secretarySession = await openSession({ userId: secretary });
    try {
      const logged = await secretarySession.query<{ log_calendar_sync_event: string }>(
        `select public.log_calendar_sync_event($1, 'pull', 'sync_pull', null, $2::jsonb, '200', null) as log_calendar_sync_event`,
        [organizationId, JSON.stringify({ window: "7d" })],
      );
      expect(logged[0].log_calendar_sync_event).toBeTruthy();

      const read = await secretarySession.query(
        "select id from public.calendar_sync_events where organization_id = $1",
        [organizationId],
      );
      expect(read).toEqual([]);

      const directInsert = await secretarySession.expectError(
        "insert into public.calendar_sync_events (organization_id, direction, action) values ($1, 'push', 'forge')",
        [organizationId],
      );
      expect(directInsert).toMatch(/permission denied|violates row-level security/i);
    } finally {
      await secretarySession.close();
    }

    const adminSession = await openSession({ userId: admin });
    try {
      const rows = await adminSession.query<{ action: string }>(
        "select action from public.calendar_sync_events where organization_id = $1",
        [organizationId],
      );
      expect(rows.map((row) => row.action)).toContain("sync_pull");
    } finally {
      await adminSession.close();
    }
  });
});
