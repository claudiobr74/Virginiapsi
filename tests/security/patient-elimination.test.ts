import { randomUUID } from "node:crypto";
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
  name: string,
  extras: { email?: string; phone?: string } = {},
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.patients
         (organization_id, preferred_name, full_name, birth_date, email, phone)
       values ($1, $2, $2, '1991-02-02', $3, $4)
       returning id`,
      [organizationId, name, extras.email ?? `${randomUUID()}@example.test`, extras.phone ?? "11999999999"],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

describe("plano de eliminação LGPD", () => {
  let admin: string;
  let secretary: string;
  let otherAdmin: string;
  let organizationId: string;
  let otherOrg: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    otherAdmin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório LGPD");
    otherOrg = await bootstrapOrganization(otherAdmin, "Outra Clínica LGPD");
    await addMember(admin, organizationId, secretary, "secretary");
  });

  it("elimina paciente só com cadastro e verifica eliminated", async () => {
    const patientId = await createPatient(admin, organizationId, "Só Cadastro");
    const session = await openSession({ userId: admin });
    try {
      const executed = await session.query<{
        elimination_status: string;
      }>("select * from public.execute_patient_elimination_plan($1)", [patientId]);
      expect(executed[0].elimination_status).toBe("eliminated");

      const verify = await session.query<{
        status: string;
        remaining_data_classes: string[];
      }>("select * from public.verify_patient_elimination($1)", [patientId]);
      expect(verify[0].status).toBe("eliminated");
      expect(verify[0].remaining_data_classes ?? []).toEqual([]);

      const row = await session.query<{ email: string | null; cpf: string | null }>(
        "select email, cpf from public.patients where id = $1",
        [patientId],
      );
      expect(row[0].email).toBeNull();
      expect(row[0].cpf).toBeNull();
    } finally {
      await session.close();
    }
  });

  it("paciente com sessão/transcrição/IA/agenda/financeiro/anexo retém o que a política manda", async () => {
    const patientId = await createPatient(admin, organizationId, "Paciente Completo");
    const session = await openSession({ userId: admin });
    try {
      await session.query(
        `insert into public.patient_clinical_profile (patient_id, organization_id, therapy_goals)
         values ($1, $2, 'Objetivo')`,
        [patientId, organizationId],
      );
      const [sess] = await session.query<{ start_clinical_session: string }>(
        "select public.start_clinical_session($1, $2) as start_clinical_session",
        [organizationId, patientId],
      );
      await session.query(
        `insert into public.session_dpep (session_id, organization_id, demand, version)
         values ($1, $2, 'Demanda', 1)`,
        [sess.start_clinical_session, organizationId],
      );
      await session.query(
        `insert into public.session_transcript_segments
           (session_id, organization_id, sequence, text, provider)
         values ($1, $2, 0, 'fala', 'local-wasm')`,
        [sess.start_clinical_session, organizationId],
      );
      await session.query(
        `insert into public.ai_runs
           (organization_id, patient_id, purpose, model, prompt_name, prompt_version, schema_version, status)
         values ($1, $2, 'session_live', 'm', 'sessionLive', '1', '1', 'succeeded')`,
        [organizationId, patientId],
      );
      await session.query(
        `insert into public.appointments
           (organization_id, patient_id, starts_at, ends_at, modality, origin, summary_snapshot, managed_by_tesseli)
         values ($1, $2, now() + interval '1 day', now() + interval '1 day 50 minutes', 'in_person', 'TESSELI', 'Nome Completo • PAC', true)`,
        [organizationId, patientId],
      );
      await session.query(
        `insert into public.financial_charges
           (organization_id, patient_id, origin, description, amount, due_date, competence_date, status)
         values ($1, $2, 'administrative', 'Sessão', 100, current_date, current_date, 'pending')`,
        [organizationId, patientId],
      );
      await session.query(
        `insert into public.patient_attachments
           (organization_id, patient_id, sensitivity, title, storage_path, mime_type, byte_size, sha256)
         values ($1, $2, 'administrative', 'Anexo', $3, 'text/plain', 4, 'abcd')`,
        [organizationId, patientId, `${organizationId}/${patientId}/file.txt`],
      );
      await session.query(
        `insert into public.consents
           (organization_id, patient_id, type, title, version, status, accepted_at)
         values ($1, $2, 'ai_processing', 'IA', 'v1', 'accepted', now())`,
        [organizationId, patientId],
      );

      const executed = await session.query<{ elimination_status: string; storage_objects: unknown }>(
        "select * from public.execute_patient_elimination_plan($1)",
        [patientId],
      );
      expect(executed[0].elimination_status).toBe("partially_eliminated");

      const verify = await session.query<{
        status: string;
        remaining_data_classes: string[];
        retained_data_classes: string[];
      }>("select * from public.verify_patient_elimination($1)", [patientId]);
      expect(verify[0].status).toBe("retained_by_policy");
      expect(verify[0].remaining_data_classes ?? []).toEqual([]);
      expect(verify[0].retained_data_classes).toEqual(
        expect.arrayContaining(["clinical_sessions", "consents", "audit_events"]),
      );

      const leftoverAi = await session.query(
        "select id from public.ai_runs where patient_id = $1",
        [patientId],
      );
      expect(leftoverAi).toEqual([]);
      const leftoverAttach = await session.query(
        "select id from public.patient_attachments where patient_id = $1",
        [patientId],
      );
      expect(leftoverAttach).toEqual([]);

      const retry = await session.query<{ elimination_status: string }>(
        "select * from public.execute_patient_elimination_plan($1)",
        [patientId],
      );
      expect(retry[0].elimination_status).toBe("partially_eliminated");
    } finally {
      await session.close();
    }
  });

  it("secretária e outro tenant não executam nem verificam", async () => {
    const patientId = await createPatient(admin, organizationId, "Alvo Isolado");
    const secretarySession = await openSession({ userId: secretary });
    try {
      const error = await secretarySession.expectError(
        "select * from public.execute_patient_elimination_plan($1)",
        [patientId],
      );
      expect(error).toMatch(/psychologist_admin/i);
    } finally {
      await secretarySession.close();
    }

    const foreign = await openSession({ userId: otherAdmin });
    try {
      const error = await foreign.expectError(
        "select * from public.execute_patient_elimination_plan($1)",
        [patientId],
      );
      expect(error).toMatch(/psychologist_admin|not found/i);
      void otherOrg;
    } finally {
      await foreign.close();
    }
  });
});
