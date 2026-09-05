import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
  runAsAdmin,
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

  it("get_google_credentials é server-only e authenticated não lê tokens", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Refresh");
    await connectGoogle(admin, organizationId, { refreshToken: "enc-secret-refresh" });

    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "select * from public.get_google_credentials($1)",
        [organizationId],
      );
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }

    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{ refresh_token_encrypted: string }>(
        "select refresh_token_encrypted from public.google_calendar_credentials where organization_id = $1",
        [organizationId],
      );
      return result.rows;
    });
    expect(rows[0].refresh_token_encrypted).toBe("enc-secret-refresh");
  });

  it("preserva o refresh token quando a renovação do Google não envia outro", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Token Preservado");
    await connectGoogle(admin, organizationId, { refreshToken: "enc-refresh-original" });

    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `select public.upsert_google_credentials(
           $1, 'enc-access-renovado', now() + interval '1 hour', null
         )`,
        [organizationId],
      );
    } finally {
      await session.close();
    }

    const rows = await runAsAdmin(async (client) => {
      const result = await client.query<{
        access_token_encrypted: string;
        refresh_token_encrypted: string;
      }>(
        `select access_token_encrypted, refresh_token_encrypted
         from public.google_calendar_credentials
         where organization_id = $1`,
        [organizationId],
      );
      return result.rows;
    });

    expect(rows[0]).toMatchObject({
      access_token_encrypted: "enc-access-renovado",
      refresh_token_encrypted: "enc-refresh-original",
    });
  });

  it("disconnect limpa metadados da conexão, credenciais e espelho GOOGLE_EXTERNAL", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Disconnect");
    await connectGoogle(admin, organizationId, { email: "conta@gmail.com" });

    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `update public.google_calendar_connections
         set calendar_id = 'primary',
             calendar_summary = 'Agenda principal',
             last_synced_at = now()
         where organization_id = $1`,
        [organizationId],
      );

      await session.query(
        `insert into public.appointments (organization_id, starts_at, ends_at, create_idempotency_key)
         values
           ($1, now() + interval '1 day', now() + interval '1 day 50 minutes', $2),
           ($1, now() + interval '2 day', now() + interval '2 day 50 minutes', $3)`,
        [organizationId, randomUUID(), randomUUID()],
      );

      await session.query(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-disc-1', 'etag-1',
           now() + interval '3 day', now() + interval '3 day 1 hour', 'Externo 1'
         )`,
        [organizationId],
      );
      await session.query(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-disc-2', 'etag-2',
           now() + interval '4 day', now() + interval '4 day 1 hour', 'Externo 2'
         )`,
        [organizationId],
      );
      await session.query(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-disc-3', 'etag-3',
           now() + interval '5 day', now() + interval '5 day 1 hour', 'Externo 3'
         )`,
        [organizationId],
      );

      const before = await session.query<{
        status: string;
        google_account_email: string | null;
        calendar_id: string | null;
        last_synced_at: string | null;
      }>(
        `select status, google_account_email, calendar_id, last_synced_at
         from public.google_calendar_connections where organization_id = $1`,
        [organizationId],
      );
      expect(before[0].status).toBe("connected");
      expect(before[0].google_account_email).toBe("conta@gmail.com");
      expect(before[0].calendar_id).toBe("primary");
      expect(before[0].last_synced_at).not.toBeNull();

      const beforeOrigins = await session.query<{ origin: string; n: string }>(
        `select origin, count(*)::text as n from public.appointments
         where organization_id = $1 group by origin order by origin`,
        [organizationId],
      );
      expect(beforeOrigins).toEqual(
        expect.arrayContaining([
          { origin: "GOOGLE_EXTERNAL", n: "3" },
          { origin: "TESSELI", n: "2" },
        ]),
      );

      await session.query("select public.disconnect_google_calendar($1)", [
        organizationId,
      ]);

      const after = await session.query<{
        status: string;
        google_account_email: string | null;
        calendar_id: string | null;
        calendar_summary: string | null;
        last_synced_at: string | null;
        last_sync_error: string | null;
        connected_by_user_id: string | null;
        scopes: string[];
      }>(
        `select status, google_account_email, calendar_id, calendar_summary,
                last_synced_at, last_sync_error, connected_by_user_id, scopes
         from public.google_calendar_connections where organization_id = $1`,
        [organizationId],
      );
      expect(after[0]).toEqual({
        status: "disconnected",
        google_account_email: null,
        calendar_id: null,
        calendar_summary: null,
        last_synced_at: null,
        last_sync_error: null,
        connected_by_user_id: null,
        scopes: [],
      });

      const tokenColumn = await session.query<{ exists: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = 'google_calendar_connections'
             and column_name = 'next_sync_token'
         ) as exists`,
      );
      if (tokenColumn[0]?.exists) {
        const tokenRow = await session.query<{ next_sync_token: string | null }>(
          `select next_sync_token from public.google_calendar_connections
           where organization_id = $1`,
          [organizationId],
        );
        expect(tokenRow[0].next_sync_token).toBeNull();
      }

      const credentials = await runAsAdmin(async (client) => {
        const result = await client.query(
          "select organization_id from public.google_calendar_credentials where organization_id = $1",
          [organizationId],
        );
        return result.rows;
      });
      expect(credentials).toEqual([]);

      const afterOrigins = await session.query<{ origin: string; n: string }>(
        `select origin, count(*)::text as n from public.appointments
         where organization_id = $1 group by origin order by origin`,
        [organizationId],
      );
      expect(afterOrigins).toEqual([{ origin: "TESSELI", n: "2" }]);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não conecta credenciais de A", async () => {
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

      expect(second[0].upsert_external_appointment).toBe(first[0].upsert_external_appointment);

      const count = await session.query<{ count: string }>(
        "select count(*)::text as count from public.appointments where organization_id = $1 and google_event_id = 'ext-evt-2'",
        [organizationId],
      );
      expect(count[0].count).toBe("1");

      const stored = await session.query<{ google_etag: string; summary_snapshot: string }>(
        "select google_etag, summary_snapshot from public.appointments where organization_id = $1 and google_event_id = 'ext-evt-2'",
        [organizationId],
      );
      expect(stored[0]).toEqual({ google_etag: "etag-b", summary_snapshot: "Segunda versão" });
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
      const read = await session.query("select id from public.appointments where id = $1", [appointmentId]);
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

describe("Agenda V2 — RPCs de espelho GOOGLE_EXTERNAL", () => {
  it("update_external_appointment_mirror atualiza o espelho e a escrita direta continua bloqueada", async () => {
    const admin = await createAuthUser();
    const outsider = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Mirror Update");

    const session = await openSession({ userId: admin });
    let externalId = "";
    try {
      const rows = await session.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-mirror-1', 'etag-1',
           now() + interval '1 day', now() + interval '1 day 1 hour',
           'Vinicius-2(desmarcou)', 'cancelled', '11'
         ) as upsert_external_appointment`,
        [organizationId],
      );
      externalId = rows[0].upsert_external_appointment;

      const stored = await session.query<{ status: string; google_color_id: string | null; summary_snapshot: string }>(
        `select status, google_color_id, summary_snapshot from public.appointments where id = $1`,
        [externalId],
      );
      expect(stored[0]).toEqual({ status: "cancelled", google_color_id: "11", summary_snapshot: "Vinicius-2(desmarcou)" });

      const updated = await session.query<{ update_external_appointment_mirror: string }>(
        `select public.update_external_appointment_mirror(
           $1, $2, now() + interval '2 day', now() + interval '2 day 1 hour',
           'Livia-1(c) / Flávia-3', 'scheduled', 'etag-2', '7', null, 'online'
         ) as update_external_appointment_mirror`,
        [organizationId, externalId],
      );
      expect(updated[0].update_external_appointment_mirror).toBe(externalId);

      const after = await session.query<{ status: string; summary_snapshot: string; google_color_id: string | null; modality: string }>(
        `select status, summary_snapshot, google_color_id, modality from public.appointments where id = $1`,
        [externalId],
      );
      expect(after[0]).toEqual({ status: "scheduled", summary_snapshot: "Livia-1(c) / Flávia-3", google_color_id: "7", modality: "online" });

      const direct = await session.query(
        "update public.appointments set summary_snapshot = 'hack' where id = $1 returning id",
        [externalId],
      );
      expect(direct).toEqual([]);
    } finally {
      await session.close();
    }

    const outsiderSession = await openSession({ userId: outsider });
    try {
      const error = await outsiderSession.expectError(
        `select public.update_external_appointment_mirror(
           $1, $2, now(), now() + interval '1 hour', 'x', 'scheduled', null, null, null, null
         )`,
        [organizationId, externalId],
      );
      expect(error).toMatch(/active membership|42501/i);
    } finally {
      await outsiderSession.close();
    }
  });

  it("delete_external_appointment_mirror remove o espelho e 404 lógico não deixa fantasma", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Mirror Delete");
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment(
           $1, 'primary', 'ext-del-1', 'etag-1',
           now() + interval '1 day', now() + interval '1 day 1 hour',
           'Ana Cláudia-1(c)'
         ) as upsert_external_appointment`,
        [organizationId],
      );
      const externalId = rows[0].upsert_external_appointment;
      const deleted = await session.query<{ delete_external_appointment_mirror: string }>(
        `select public.delete_external_appointment_mirror($1, $2) as delete_external_appointment_mirror`,
        [organizationId, externalId],
      );
      expect(deleted[0].delete_external_appointment_mirror).toBe(externalId);
      const leftover = await session.query("select id from public.appointments where id = $1", [externalId]);
      expect(leftover).toEqual([]);
      const missing = await session.expectError(`select public.delete_external_appointment_mirror($1, $2)`, [organizationId, externalId]);
      expect(missing).toMatch(/not found|P0002/i);
    } finally {
      await session.close();
    }
  });
});

describe("Agenda V2.1 — cancelled_google_color_ids por organização", () => {
  it("upsert_external_appointment atualiza google_color_id em evento já existente", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Color Backfill");
    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `select public.upsert_external_appointment($1, 'primary', 'ext-color-1', 'etag-a', now() + interval '1 day', now() + interval '1 day 1 hour', 'Isadora? não pode', 'scheduled', null)`,
        [organizationId],
      );
      const before = await session.query<{ google_color_id: string | null }>(
        `select google_color_id from public.appointments where organization_id = $1 and google_event_id = 'ext-color-1'`,
        [organizationId],
      );
      expect(before[0].google_color_id).toBeNull();
      await session.query(
        `select public.upsert_external_appointment($1, 'primary', 'ext-color-1', 'etag-b', now() + interval '1 day', now() + interval '1 day 1 hour', 'Isadora? não pode', 'cancelled', '9')`,
        [organizationId],
      );
      const after = await session.query<{ google_color_id: string | null; status: string }>(
        `select google_color_id, status from public.appointments where organization_id = $1 and google_event_id = 'ext-color-1'`,
        [organizationId],
      );
      expect(after[0]).toEqual({ google_color_id: "9", status: "cancelled" });
    } finally {
      await session.close();
    }
  });

  it("admin define cancelled_google_color_ids; secretária e outro tenant não", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Color Map");
    await addMember(admin, organizationId, secretary, "secretary");
    await connectGoogle(admin, organizationId);

    const adminSession = await openSession({ userId: admin });
    try {
      const saved = await adminSession.query<{ set_google_cancelled_color_ids: string[] }>(
        `select public.set_google_cancelled_color_ids($1, array['9', 'abc', '9', '']) as set_google_cancelled_color_ids`,
        [organizationId],
      );
      expect(saved[0].set_google_cancelled_color_ids).toEqual(["9"]);
      const stored = await adminSession.query<{ cancelled_google_color_ids: string[] }>(
        `select cancelled_google_color_ids from public.google_calendar_connections where organization_id = $1`,
        [organizationId],
      );
      expect(stored[0].cancelled_google_color_ids).toEqual(["9"]);
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const rpcError = await secretarySession.expectError(`select public.set_google_cancelled_color_ids($1, array['8'])`, [organizationId]);
      expect(rpcError).toMatch(/only psychologist_admin/i);
      const updateError = await secretarySession.expectError(
        `update public.google_calendar_connections set cancelled_google_color_ids = array['8'] where organization_id = $1`,
        [organizationId],
      );
      expect(updateError).toMatch(/only psychologist_admin/i);
    } finally {
      await secretarySession.close();
    }

    const outsider = await createAuthUser();
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const error = await outsiderSession.expectError(`select public.set_google_cancelled_color_ids($1, array['8'])`, [organizationId]);
      expect(error).toMatch(/only psychologist_admin/i);
    } finally {
      await outsiderSession.close();
    }
  });
});

describe("Agenda V2.2 — google_event_type no espelho", () => {
  it("upsert_external_appointment persiste e atualiza google_event_type", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Event Type");
    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `select public.upsert_external_appointment($1, 'primary', 'ext-type-1', 'etag-a', now() + interval '1 day', now() + interval '1 day 1 hour', 'Lucas B+1(viajando)', 'scheduled', '8', null)`,
        [organizationId],
      );
      const before = await session.query<{ google_event_type: string | null }>(
        `select google_event_type from public.appointments where organization_id = $1 and google_event_id = 'ext-type-1'`,
        [organizationId],
      );
      expect(before[0].google_event_type).toBeNull();
      await session.query(
        `select public.upsert_external_appointment($1, 'primary', 'ext-type-1', 'etag-b', now() + interval '1 day', now() + interval '1 day 1 hour', 'Lucas B+1(viajando)', 'scheduled', '8', 'outOfOffice')`,
        [organizationId],
      );
      const after = await session.query<{ google_event_type: string | null; google_color_id: string | null; status: string }>(
        `select google_event_type, google_color_id, status from public.appointments where organization_id = $1 and google_event_id = 'ext-type-1'`,
        [organizationId],
      );
      expect(after[0]).toEqual({ google_event_type: "outOfOffice", google_color_id: "8", status: "scheduled" });
    } finally {
      await session.close();
    }
  });
});

describe("Agenda V2.3 — google_deleted_at e unavailable_google_color_ids", () => {
  it("mark_external_google_event_deleted marca o mirror sem reescrever status", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Ghost Delete");
    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `select public.upsert_external_appointment($1, 'primary', 'helio-x', 'etag-a', now() + interval '1 day', now() + interval '1 day 1 hour', 'Helio-1??? Julianna-1???', 'scheduled', null, 'default')`,
        [organizationId],
      );
      const marked = await session.query<{ mark_external_google_event_deleted: string | null }>(
        `select public.mark_external_google_event_deleted($1, 'primary', 'helio-x') as mark_external_google_event_deleted`,
        [organizationId],
      );
      expect(marked[0].mark_external_google_event_deleted).toBeTruthy();
      const after = await session.query<{ status: string; google_deleted_at: string | null }>(
        `select status, google_deleted_at from public.appointments where organization_id = $1 and google_event_id = 'helio-x'`,
        [organizationId],
      );
      expect(after[0].status).toBe("scheduled");
      expect(after[0].google_deleted_at).not.toBeNull();
    } finally {
      await session.close();
    }
  });

  it("upsert de evento ativo limpa google_deleted_at", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Undelete");
    const session = await openSession({ userId: admin });
    try {
      await session.query(`select public.upsert_external_appointment($1, 'primary', 'restore-1', 'etag-a', now() + interval '1 day', now() + interval '1 day 1 hour', 'Jessyca-1(c)', 'scheduled', null, 'default')`, [organizationId]);
      await session.query(`select public.mark_external_google_event_deleted($1, 'primary', 'restore-1')`, [organizationId]);
      await session.query(`select public.upsert_external_appointment($1, 'primary', 'restore-1', 'etag-b', now() + interval '1 day', now() + interval '1 day 1 hour', 'Jessyca-1(c)', 'scheduled', null, 'default')`, [organizationId]);
      const after = await session.query<{ google_deleted_at: string | null }>(
        `select google_deleted_at from public.appointments where organization_id = $1 and google_event_id = 'restore-1'`,
        [organizationId],
      );
      expect(after[0].google_deleted_at).toBeNull();
    } finally {
      await session.close();
    }
  });

  it("reconcile_unseen_google_mirrors marca só o id ausente, não a instância irmã", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Snapshot");
    const session = await openSession({ userId: admin });
    try {
      await session.query(`select public.upsert_external_appointment($1, 'primary', 'series_20260901T100000Z', 'etag-a', now() + interval '1 day', now() + interval '1 day 1 hour', 'Série instância 1', 'scheduled', null, 'default')`, [organizationId]);
      await session.query(`select public.upsert_external_appointment($1, 'primary', 'series_20260908T100000Z', 'etag-a', now() + interval '8 day', now() + interval '8 day 1 hour', 'Série instância 2', 'scheduled', null, 'default')`, [organizationId]);
      const marked = await session.query<{ reconcile_unseen_google_mirrors: number }>(
        `select public.reconcile_unseen_google_mirrors($1, 'primary', array['series_20260908T100000Z'], now() - interval '1 day', now() + interval '30 day') as reconcile_unseen_google_mirrors`,
        [organizationId],
      );
      expect(marked[0].reconcile_unseen_google_mirrors).toBe(1);
      const rows = await session.query<{ google_event_id: string; google_deleted_at: string | null }>(
        `select google_event_id, google_deleted_at from public.appointments where organization_id = $1 and google_event_id like 'series_%' order by google_event_id`,
        [organizationId],
      );
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.google_event_id === "series_20260901T100000Z")?.google_deleted_at).not.toBeNull();
      expect(rows.find((row) => row.google_event_id === "series_20260908T100000Z")?.google_deleted_at).toBeNull();
    } finally {
      await session.close();
    }
  });

  it("admin define unavailable_google_color_ids; secretária, anon e outro tenant não", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Unavailable Map");
    await addMember(admin, organizationId, secretary, "secretary");
    await connectGoogle(admin, organizationId);

    const adminSession = await openSession({ userId: admin });
    try {
      const saved = await adminSession.query<{ set_google_unavailable_color_ids: string[] }>(
        `select public.set_google_unavailable_color_ids($1, array['8', 'abc', '8', '']) as set_google_unavailable_color_ids`,
        [organizationId],
      );
      expect(saved[0].set_google_unavailable_color_ids).toEqual(["8"]);
      const stored = await adminSession.query<{ unavailable_google_color_ids: string[] }>(
        `select unavailable_google_color_ids from public.google_calendar_connections where organization_id = $1`,
        [organizationId],
      );
      expect(stored[0].unavailable_google_color_ids).toEqual(["8"]);
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const rpcError = await secretarySession.expectError(`select public.set_google_unavailable_color_ids($1, array['11'])`, [organizationId]);
      expect(rpcError).toMatch(/only psychologist_admin/i);
      const updateError = await secretarySession.expectError(`update public.google_calendar_connections set unavailable_google_color_ids = array['11'] where organization_id = $1`, [organizationId]);
      expect(updateError).toMatch(/only psychologist_admin/i);
    } finally {
      await secretarySession.close();
    }

    const outsider = await createAuthUser();
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const error = await outsiderSession.expectError(`select public.set_google_unavailable_color_ids($1, array['8'])`, [organizationId]);
      expect(error).toMatch(/only psychologist_admin/i);
      const markError = await outsiderSession.expectError(`select public.mark_external_google_event_deleted($1, 'primary', 'x')`, [organizationId]);
      expect(markError).toMatch(/active membership|42501/i);
    } finally {
      await outsiderSession.close();
    }

    const anonSession = await openSession({ role: "anon" });
    try {
      const error = await anonSession.expectError(`select public.mark_external_google_event_deleted($1, 'primary', 'x')`, [organizationId]);
      expect(error).toMatch(/permission denied|42501|does not exist/i);
    } finally {
      await anonSession.close();
    }
  });

  it("upsert colorId 8 não grava status cancelled", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Color Persist");
    const session = await openSession({ userId: admin });
    try {
      await session.query(`select public.upsert_external_appointment($1, 'primary', 'lucas-1', 'etag-a', now() + interval '1 day', now() + interval '1 day 1 hour', 'Lucas B+1(viajando)', 'scheduled', '8', 'default')`, [organizationId]);
      const stored = await session.query<{ status: string; google_color_id: string | null; google_deleted_at: string | null }>(
        `select status, google_color_id, google_deleted_at from public.appointments where organization_id = $1 and google_event_id = 'lucas-1'`,
        [organizationId],
      );
      expect(stored[0]).toEqual({ status: "scheduled", google_color_id: "8", google_deleted_at: null });
    } finally {
      await session.close();
    }
  });
});

describe("Agenda V2.4 — vincular paciente no espelho Google", () => {
  it("link_external_appointment_patient grava só patient_id e inicia sessão sem mudar o Google", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Link Google");
    const session = await openSession({ userId: admin });
    try {
      const patient = await session.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name, birth_date) values ($1, 'Jessyca Ferreira', 'Jessyca Ferreira', '1992-04-01') returning id`,
        [organizationId],
      );
      const patientId = patient[0].id;
      const created = await session.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment($1, 'primary', 'jessyca-1', 'etag-j', now() + interval '1 day', now() + interval '1 day 1 hour', 'Jessyca-1(c)', 'scheduled', '7', 'default') as upsert_external_appointment`,
        [organizationId],
      );
      const appointmentId = created[0].upsert_external_appointment;
      const before = await session.query<{ summary_snapshot: string; starts_at: string; ends_at: string; google_color_id: string | null; google_event_type: string | null; patient_id: string | null }>(
        `select summary_snapshot, starts_at::text, ends_at::text, google_color_id, google_event_type, patient_id from public.appointments where id = $1`,
        [appointmentId],
      );
      const linked = await session.query<{ link_external_appointment_patient: string }>(
        `select public.link_external_appointment_patient($1, $2, $3) as link_external_appointment_patient`,
        [organizationId, appointmentId, patientId],
      );
      expect(linked[0].link_external_appointment_patient).toBe(appointmentId);
      const after = await session.query<{ summary_snapshot: string; starts_at: string; ends_at: string; google_color_id: string | null; google_event_type: string | null; patient_id: string | null }>(
        `select summary_snapshot, starts_at::text, ends_at::text, google_color_id, google_event_type, patient_id from public.appointments where id = $1`,
        [appointmentId],
      );
      expect(after[0].patient_id).toBe(patientId);
      expect(after[0].summary_snapshot).toBe(before[0].summary_snapshot);
      expect(after[0].starts_at).toBe(before[0].starts_at);
      expect(after[0].ends_at).toBe(before[0].ends_at);
      expect(after[0].google_color_id).toBe(before[0].google_color_id);
      expect(after[0].google_event_type).toBe(before[0].google_event_type);
      const started = await session.query<{ start_clinical_session: string }>(
        "select public.start_clinical_session($1, $2, $3) as start_clinical_session",
        [organizationId, patientId, appointmentId],
      );
      const clinical = await session.query<{ patient_id: string; appointment_id: string | null }>(
        `select patient_id, appointment_id from public.clinical_sessions where id = $1`,
        [started[0].start_clinical_session],
      );
      expect(clinical[0]).toEqual({ patient_id: patientId, appointment_id: appointmentId });
    } finally {
      await session.close();
    }
  });

  it("rejeita paciente de outra organização", async () => {
    const adminA = await createAuthUser();
    const adminB = await createAuthUser();
    const orgA = await bootstrapOrganization(adminA, "Consultório Link A");
    const orgB = await bootstrapOrganization(adminB, "Consultório Link B");
    const sessionB = await openSession({ userId: adminB });
    let patientB = "";
    try {
      const rows = await sessionB.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name) values ($1, 'Paciente B', 'Paciente B') returning id`,
        [orgB],
      );
      patientB = rows[0].id;
    } finally {
      await sessionB.close();
    }

    const sessionA = await openSession({ userId: adminA });
    try {
      const created = await sessionA.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment($1, 'primary', 'cross-org-1', 'etag-x', now() + interval '1 day', now() + interval '1 day 1 hour', 'Jessyca-1(c)') as upsert_external_appointment`,
        [orgA],
      );
      const error = await sessionA.expectError(`select public.link_external_appointment_patient($1, $2, $3)`, [orgA, created[0].upsert_external_appointment, patientB]);
      expect(error).toMatch(/same organization|23514/i);
    } finally {
      await sessionA.close();
    }
  });

  it("recusa tombstone google_deleted_at e membro de fora", async () => {
    const admin = await createAuthUser();
    const outsider = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Link Tombstone");
    const session = await openSession({ userId: admin });
    let appointmentId = "";
    let patientId = "";
    try {
      const patient = await session.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name) values ($1, 'Jessyca', 'Jessyca') returning id`,
        [organizationId],
      );
      patientId = patient[0].id;
      const created = await session.query<{ upsert_external_appointment: string }>(
        `select public.upsert_external_appointment($1, 'primary', 'ghost-1', 'etag-g', now() + interval '1 day', now() + interval '1 day 1 hour', 'Helio-1??? Julianna-1???') as upsert_external_appointment`,
        [organizationId],
      );
      appointmentId = created[0].upsert_external_appointment;
      await session.query(`select public.mark_external_google_event_deleted($1, 'primary', 'ghost-1')`, [organizationId]);
      const deletedError = await session.expectError(`select public.link_external_appointment_patient($1, $2, $3)`, [organizationId, appointmentId, patientId]);
      expect(deletedError).toMatch(/not found|P0002/i);
    } finally {
      await session.close();
    }

    const outsiderSession = await openSession({ userId: outsider });
    try {
      const error = await outsiderSession.expectError(`select public.link_external_appointment_patient($1, $2, $3)`, [organizationId, appointmentId, patientId]);
      expect(error).toMatch(/active membership|42501/i);
    } finally {
      await outsiderSession.close();
    }
  });

  it("anon não executa a RPC de vínculo", async () => {
    const anon = await openSession({ role: "anon" });
    try {
      const error = await anon.expectError(`select public.link_external_appointment_patient($1, $2, $3)`, [randomUUID(), randomUUID(), randomUUID()]);
      expect(error).toMatch(/permission denied|42501|does not exist/i);
    } finally {
      await anon.close();
    }
  });
});
