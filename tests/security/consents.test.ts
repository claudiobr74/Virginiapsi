import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

async function createPatient(
  actorUserId: string,
  organizationId: string,
  name = "Paciente Consentimento",
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.patients (organization_id, preferred_name, full_name, birth_date)
       values ($1, $2, $2, '1990-05-10') returning id`,
      [organizationId, name],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

async function recordConsent(
  actorUserId: string,
  organizationId: string,
  patientId: string,
  type = "session_recording",
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.consents (organization_id, patient_id, type, title, version, status)
       values ($1, $2, $3::public.consent_type, 'Consentimento', 'minimo-2026-08', 'accepted')
       returning id`,
      [organizationId, patientId, type],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

describe("consents — registro mínimo do gate de captura", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Consentimento");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId);
  });

  it("admin registra consentimento e a autoria vem de auth.uid()", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{
        accepted_by: string;
        accepted_at: string;
      }>(
        `insert into public.consents (organization_id, patient_id, type, title, version, status, accepted_by)
         values ($1, $2, 'ai_processing', 'Apoio de IA', 'minimo-2026-08', 'accepted', $3)
         returning accepted_by, accepted_at`,
        [organizationId, patientId, secretary],
      );
      // O accepted_by enviado pelo cliente (secretary) é descartado.
      expect(rows[0].accepted_by).toBe(admin);
      expect(rows[0].accepted_at).toBeTruthy();
    } finally {
      await session.close();
    }
  });

  it("secretária não lê nem registra consentimento clínico", async () => {
    await recordConsent(admin, organizationId, patientId, "session_transcription");

    const session = await openSession({ userId: secretary });
    try {
      const read = await session.query(
        `select id from public.consents
         where patient_id = $1 and type = 'session_transcription'`,
        [patientId],
      );
      expect(read).toEqual([]);

      const error = await session.expectError(
        `insert into public.consents (organization_id, patient_id, type, title, version, status)
         values ($1, $2, 'session_recording', 'Gravação', 'minimo-2026-08', 'accepted')`,
        [organizationId, patientId],
      );
      expect(error).toMatch(/violates row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("secretária lê apenas os tipos administrativos", async () => {
    const adminSession = await openSession({ userId: admin });
    try {
      await adminSession.query(
        `insert into public.consents (organization_id, patient_id, type, title, version, status)
         values ($1, $2, 'whatsapp', 'WhatsApp', 'minimo-2026-08', 'accepted')`,
        [organizationId, patientId],
      );
    } finally {
      await adminSession.close();
    }

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query<{ type: string }>(
        "select type from public.consents where patient_id = $1",
        [patientId],
      );
      expect(rows.map((row) => row.type)).toEqual(["whatsapp"]);
    } finally {
      await session.close();
    }
  });

  it("ninguém apaga consentimento: revogação é transição de status", async () => {
    const consentId = await recordConsent(admin, organizationId, patientId);

    const session = await openSession({ userId: admin });
    try {
      const deleted = await session.expectError(
        "delete from public.consents where id = $1",
        [consentId],
      );
      expect(deleted).toMatch(/permission denied|violates row-level security/i);

      const revoked = await session.query<{ status: string; revoked_at: string }>(
        `update public.consents set status = 'revoked' where id = $1
         returning status, revoked_at`,
        [consentId],
      );
      expect(revoked[0].status).toBe("revoked");
      expect(revoked[0].revoked_at).toBeTruthy();
    } finally {
      await session.close();
    }
  });

  it("consentimento revogado não volta a valer por UPDATE", async () => {
    const consentId = await recordConsent(admin, organizationId, patientId);
    const session = await openSession({ userId: admin });
    try {
      await session.query(
        "update public.consents set status = 'revoked' where id = $1",
        [consentId],
      );

      const error = await session.expectError(
        "update public.consents set status = 'accepted' where id = $1",
        [consentId],
      );
      expect(error).toMatch(/cannot be reactivated/i);
    } finally {
      await session.close();
    }
  });

  it("paciente/tipo/versão de um consentimento aceito são imutáveis", async () => {
    const consentId = await recordConsent(admin, organizationId, patientId);
    const otherPatient = await createPatient(admin, organizationId, "Outro Paciente");

    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{
        patient_id: string;
        type: string;
        version: string;
      }>(
        `update public.consents
         set patient_id = $2, type = 'ai_processing', version = 'forjada'
         where id = $1
         returning patient_id, type, version`,
        [consentId, otherPatient],
      );
      expect(rows[0].patient_id).toBe(patientId);
      expect(rows[0].type).toBe("session_recording");
      expect(rows[0].version).toBe("minimo-2026-08");
    } finally {
      await session.close();
    }
  });

  it("consentimento precisa ser de paciente da mesma organização", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Outro Consultório Consent");
    const otherPatient = await createPatient(otherAdmin, otherOrg, "Paciente de B");

    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.consents (organization_id, patient_id, type, title, version, status)
         values ($1, $2, 'session_recording', 'Gravação', 'minimo-2026-08', 'accepted')`,
        [organizationId, otherPatient],
      );
      expect(error).toMatch(/same organization/i);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não lê nem escreve consentimentos de A", async () => {
    const consentId = await recordConsent(admin, organizationId, patientId);
    const outsider = await createAuthUser();
    await bootstrapOrganization(outsider, "Consultório Isolado Consent");

    const session = await openSession({ userId: outsider });
    try {
      const read = await session.query(
        "select id from public.consents where id = $1",
        [consentId],
      );
      expect(read).toEqual([]);

      const write = await session.query(
        "update public.consents set status = 'revoked' where id = $1 returning id",
        [consentId],
      );
      expect(write).toEqual([]);
    } finally {
      await session.close();
    }
  });
});
