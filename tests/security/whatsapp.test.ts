import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_URL,
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

async function createPatient(
  actorUserId: string,
  organizationId: string,
  extras: { name?: string; phone?: string } = {},
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.patients (organization_id, preferred_name, full_name, birth_date, phone)
       values ($1, $2, $2, '1990-05-10', $3) returning id`,
      [organizationId, extras.name ?? "Paciente WhatsApp", extras.phone ?? "11988887777"],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

async function acceptWhatsappConsent(
  actorUserId: string,
  organizationId: string,
  patientId: string,
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.consents (organization_id, patient_id, type, title, version, status)
       values ($1, $2, 'whatsapp', 'WhatsApp', 'minimo-2026-08', 'accepted') returning id`,
      [organizationId, patientId],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

async function enableWhatsapp(
  actorUserId: string,
  organizationId: string,
  patientId: string,
  consentId: string,
): Promise<void> {
  const session = await openSession({ userId: actorUserId });
  try {
    await session.query(
      `insert into public.communication_preferences (patient_id, organization_id, whatsapp_enabled, consent_id)
       values ($1, $2, true, $3)
       on conflict (patient_id) do update set whatsapp_enabled = true, consent_id = excluded.consent_id`,
      [patientId, organizationId, consentId],
    );
  } finally {
    await session.close();
  }
}

async function createFutureAppointment(
  actorUserId: string,
  organizationId: string,
  patientId: string,
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, starts_at, ends_at, create_idempotency_key
       ) values ($1, $2, now() + interval '2 days', now() + interval '2 days 50 minutes', $3)
       returning id`,
      [organizationId, patientId, randomUUID()],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

describe("whatsapp — consentimento, outbox, claim e scheduler", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório WhatsApp");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId);
  });

  it("a migration não grava valores de Vault", () => {
    const sql = readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20260820220000_whatsapp.sql"),
      "utf8",
    );
    expect(sql).toMatch(/tesseli_app_url/);
    expect(sql).toMatch(/tesseli_cron_secret/);
    expect(sql).not.toMatch(/insert\s+into\s+vault/i);
    expect(sql).not.toMatch(/CRON_SECRET\s*=/);
  });

  it("não ativa preferência sem consentimento whatsapp aceito", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.communication_preferences (patient_id, organization_id, whatsapp_enabled)
         values ($1, $2, true)`,
        [patientId, organizationId],
      );
      expect(error).toMatch(/whatsapp preference requires an accepted whatsapp consent/i);
    } finally {
      await session.close();
    }
  });

  it("secretária registra consentimento administrativo e ativa o canal", async () => {
    const consentId = await acceptWhatsappConsent(secretary, organizationId, patientId);
    await enableWhatsapp(secretary, organizationId, patientId, consentId);

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query<{ whatsapp_enabled: boolean }>(
        "select whatsapp_enabled from public.communication_preferences where patient_id = $1",
        [patientId],
      );
      expect(rows[0].whatsapp_enabled).toBe(true);
    } finally {
      await session.close();
    }
  });

  it("consulta gerenciada enfileira 24h e 2h com unique (appointment_id, reminder_type)", async () => {
    const appointmentId = await createFutureAppointment(admin, organizationId, patientId);
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ reminder_type: string; state: string }>(
        `select reminder_type, state from public.whatsapp_reminder_outbox
         where appointment_id = $1 order by reminder_type`,
        [appointmentId],
      );
      expect(rows.map((row) => row.reminder_type)).toEqual(["reminder_24h", "reminder_2h"]);
      expect(rows.every((row) => row.state === "scheduled")).toBe(true);

      const error = await session.expectError(
        `insert into public.whatsapp_reminder_outbox (
           organization_id, appointment_id, patient_id, reminder_type, scheduled_for
         ) values ($1, $2, $3, 'reminder_24h', now() + interval '1 day')`,
        [organizationId, appointmentId, patientId],
      );
      expect(error).toMatch(/duplicate key|unique/i);
    } finally {
      await session.close();
    }
  });

  it("cancelar a consulta cancela o outbox pendente", async () => {
    const appointmentId = await createFutureAppointment(admin, organizationId, patientId);
    const session = await openSession({ userId: admin });
    try {
      await session.query("update public.appointments set status = 'cancelled' where id = $1", [
        appointmentId,
      ]);
      const rows = await session.query<{ state: string }>(
        "select state from public.whatsapp_reminder_outbox where appointment_id = $1",
        [appointmentId],
      );
      expect(rows.every((row) => row.state === "canceled")).toBe(true);
    } finally {
      await session.close();
    }
  });

  it("authenticated não chama claim; service_role faz claim atômico com SKIP LOCKED", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError("select * from public.claim_due_whatsapp_reminders(5)");
      expect(error).toMatch(/not authorized|42501|permission denied/i);
    } finally {
      await session.close();
    }

    const appointmentA = await createFutureAppointment(admin, organizationId, patientId);
    const appointmentB = await createFutureAppointment(admin, organizationId, patientId);

    const writer = await openSession({ userId: admin });
    try {
      await writer.query(
        `insert into public.whatsapp_reminder_outbox (
           organization_id, appointment_id, patient_id, reminder_type, scheduled_for, state
         ) values
           ($1, $2, $4, 'reminder_24h', now() - interval '1 minute', 'scheduled'),
           ($1, $3, $4, 'reminder_24h', now() - interval '1 minute', 'scheduled')
         on conflict (appointment_id, reminder_type) do update
           set scheduled_for = excluded.scheduled_for, state = 'scheduled', next_attempt_at = null`,
        [organizationId, appointmentA, appointmentB, patientId],
      );
    } finally {
      await writer.close();
    }

    const first = await openSession({ role: "service_role" });
    const second = await openSession({ role: "service_role" });
    try {
      const [a, b] = await Promise.all([
        first.query<{ id: string }>("select id from public.claim_due_whatsapp_reminders(1)"),
        second.query<{ id: string }>("select id from public.claim_due_whatsapp_reminders(1)"),
      ]);
      const ids = [...a, ...b].map((row) => row.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    } finally {
      await first.close();
      await second.close();
    }
  });

  it("retry idempotente: falha retryable só volta ao claim depois de next_attempt_at", async () => {
    const appointmentId = await createFutureAppointment(admin, organizationId, patientId);
    const service = await openSession({ role: "service_role" });
    try {
      await service.query(
        `update public.whatsapp_reminder_outbox
            set state = 'claimed', attempt_count = 1, scheduled_for = now() - interval '1 minute'
          where appointment_id = $1 and reminder_type = 'reminder_2h'`,
        [appointmentId],
      );
      const idRows = await service.query<{ id: string }>(
        `select id from public.whatsapp_reminder_outbox
          where appointment_id = $1 and reminder_type = 'reminder_2h'`,
        [appointmentId],
      );
      const outboxId = idRows[0].id;
      await service.query("select public.mark_whatsapp_outbox_failed($1, true, '429')", [outboxId]);

      const tooSoon = await service.query<{ id: string }>(
        "select id from public.claim_due_whatsapp_reminders(20)",
      );
      expect(tooSoon.map((row) => row.id)).not.toContain(outboxId);

      await service.query(
        "update public.whatsapp_reminder_outbox set next_attempt_at = now() - interval '1 second' where id = $1",
        [outboxId],
      );
      const claimed = await service.query<{ id: string; attempt_count: number }>(
        "select id, attempt_count from public.claim_due_whatsapp_reminders(20)",
      );
      const again = claimed.find((row) => row.id === outboxId);
      expect(again).toBeTruthy();
      expect(again?.attempt_count).toBe(2);

      await service.query("select public.mark_whatsapp_outbox_sent($1, 'SMRETRY')", [outboxId]);
      const sent = await service.query<{ state: string; twilio_message_sid: string }>(
        "select state, twilio_message_sid from public.whatsapp_reminder_outbox where id = $1",
        [outboxId],
      );
      expect(sent[0].state).toBe("sent");
      expect(sent[0].twilio_message_sid).toBe("SMRETRY");
    } finally {
      await service.close();
    }
  });

  it("MessageSid inbound é único e o tenant vizinho não lê", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Outro Consultório WhatsApp");
    const sid = `SM${randomUUID().replaceAll("-", "").slice(0, 32)}`;

    const service = await openSession({ role: "service_role" });
    try {
      await service.query(
        `insert into public.whatsapp_inbound_messages (organization_id, patient_id, message_sid, from_number, intent, body_redacted)
         values ($1, $2, $3, '+5511988887777', 'confirm', 'confirm')`,
        [organizationId, patientId, sid],
      );
      const error = await service.expectError(
        `insert into public.whatsapp_inbound_messages (organization_id, message_sid, from_number, intent)
         values ($1, $2, '+5511988887777', 'unknown')`,
        [organizationId, sid],
      );
      expect(error).toMatch(/duplicate key|unique/i);
    } finally {
      await service.close();
    }

    const outsider = await openSession({ userId: otherAdmin });
    try {
      const rows = await outsider.query(
        "select id from public.whatsapp_inbound_messages where message_sid = $1",
        [sid],
      );
      expect(rows).toEqual([]);
      void otherOrg;
    } finally {
      await outsider.close();
    }
  });

  it("invoke_whatsapp_reminder_job lê Vault de teste e enfileira pg_net sem secretos na migration", async () => {
    const adminClient = new Client({ connectionString: ADMIN_URL });
    await adminClient.connect();
    try {
      await adminClient.query("delete from net.http_request_queue");
      const empty = await openSession({ role: "service_role" });
      try {
        await empty.query("select public.invoke_whatsapp_reminder_job()");
      } finally {
        await empty.close();
      }
      const before = await adminClient.query("select count(*)::int as n from net.http_request_queue");
      expect(before.rows[0].n).toBe(0);

      await adminClient.query(
        `insert into vault.secrets (name, secret) values
           ('tesseli_app_url', 'https://tesseli.test'),
           ('tesseli_cron_secret', 'test-cron-secret')
         on conflict (name) do update set secret = excluded.secret`,
      );
    } finally {
      await adminClient.end();
    }

    const service = await openSession({ role: "service_role" });
    try {
      await service.query("select public.invoke_whatsapp_reminder_job()");
    } finally {
      await service.close();
    }

    const reader = new Client({ connectionString: ADMIN_URL });
    await reader.connect();
    try {
      const queued = await reader.query<{ url: string; headers: { "x-cron-secret"?: string } }>(
        "select url, headers from net.http_request_queue order by id desc limit 1",
      );
      expect(queued.rows[0].url).toBe("https://tesseli.test/api/jobs/whatsapp-reminders");
      expect(queued.rows[0].headers["x-cron-secret"]).toBe("test-cron-secret");
    } finally {
      await reader.end();
    }
  });

  it("match de telefone é só service_role", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "select * from public.match_patients_by_whatsapp_e164('+5511988887777')",
      );
      expect(error).toMatch(/permission denied|not authorized/i);
    } finally {
      await session.close();
    }

    const service = await openSession({ role: "service_role" });
    try {
      const rows = await service.query<{ patient_id: string }>(
        "select patient_id from public.match_patients_by_whatsapp_e164('+5511988887777')",
      );
      expect(rows.some((row) => row.patient_id === patientId)).toBe(true);
    } finally {
      await service.close();
    }
  });
});
