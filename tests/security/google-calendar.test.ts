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
        overrides.accessToken ?? "enc-access-token",
        overrides.refreshToken ?? "enc-refresh-token",
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
    await connectGoogle(admin, organizationId, { refreshToken: "enc-secret-refresh" });

    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ refresh_token_encrypted: string }>(
        "select * from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(rows[0].refresh_token_encrypted).toBe("enc-secret-refresh");
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
    } finally {
      await session.close();
    }
  });
});

describe("google_calendar_connections — leitura ampla, escrita restrita", () => {
  it("secretária lê o status da conexão e pode trocar o calendário selecionado", async () => {
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
      expect(updated[0].calendar_id).toBe("primary");
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
    } finally {
      await session.close();
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
