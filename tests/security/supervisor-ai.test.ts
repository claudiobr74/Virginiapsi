import { beforeAll, describe, expect, it } from "vitest";
import { addMember, bootstrapOrganization, createAuthUser, openSession } from "./support/db";

describe("ai_runs/ai_artifacts — vocabulário 'supervisor' (Fase 7)", () => {
  let admin: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Supervisor");
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name, birth_date)
         values ($1, 'Paciente Supervisor', 'Paciente Supervisor', '1990-01-01') returning id`,
        [organizationId],
      );
      patientId = rows[0].id;
    } finally {
      await session.close();
    }
  });

  it("aceita purpose/type = 'supervisor' sem quebrar os valores da Fase 6", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [run] = await session.query<{ id: string }>(
        `insert into public.ai_runs
           (organization_id, patient_id, purpose, model, prompt_name, prompt_version, schema_version, status, source_ids)
         values ($1, $2, 'supervisor', 'gemini-test', 'supervisor', '1.2.0', '1', 'succeeded', '{"selectedSessionIds": []}'::jsonb)
         returning id`,
        [organizationId, patientId],
      );

      const artifact = await session.query<{ type: string }>(
        `insert into public.ai_artifacts (run_id, organization_id, type, structured_content)
         values ($1, $2, 'supervisor', '{"directAnswer": "teste"}'::jsonb)
         returning type`,
        [run.id, organizationId],
      );
      expect(artifact[0].type).toBe("supervisor");

      // Regression: Fase 6's purposes still work after widening the constraint.
      const sessionRow = await session.query<{ id: string }>(
        `insert into public.ai_runs
           (organization_id, patient_id, purpose, model, prompt_name, prompt_version, schema_version, status)
         values ($1, $2, 'session_preparation', 'gemini-test', 'sessionPreparation', '1.2.0', '1', 'succeeded')
         returning id`,
        [organizationId, patientId],
      );
      expect(sessionRow).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it("rejeita um purpose/type fora do vocabulário conhecido", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.ai_runs
           (organization_id, patient_id, purpose, model, prompt_name, prompt_version, schema_version, status)
         values ($1, $2, 'not_a_real_purpose', 'gemini-test', 'x', '1', '1', 'succeeded')`,
        [organizationId, patientId],
      );
      expect(error).toMatch(/check/i);
    } finally {
      await session.close();
    }
  });

  it("secretária continua sem acesso a runs/artifacts de supervisão", async () => {
    const secretary = await createAuthUser();
    await addMember(admin, organizationId, secretary, "secretary");

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query(
        `select id from public.ai_runs where organization_id = $1 and purpose = 'supervisor'`,
        [organizationId],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });
});
