import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

const CLOSING_CONTENT = {
  dpepDraft: {
    demanda: "Demanda gerada por IA",
    procedimentos: "Proc",
    evolucao: "Evo",
    plano: "Plano",
  },
};

const SUPERVISOR_CONTENT = {
  clinicalSynthesis: "Síntese clínica de supervisão",
  hypotheses: [{ hypothesis: "Hipótese A" }],
};

async function createPatient(
  actorUserId: string,
  organizationId: string,
  name: string,
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.patients (organization_id, preferred_name, full_name, birth_date)
       values ($1, $2, $2, '1990-01-01') returning id`,
      [organizationId, name],
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

async function finalizeSession(
  actorUserId: string,
  organizationId: string,
  sessionId: string,
): Promise<void> {
  const session = await openSession({ userId: actorUserId });
  try {
    await session.query(
      "select * from public.finalize_clinical_session($1, $2, $3)",
      [sessionId, organizationId, randomUUID()],
    );
  } finally {
    await session.close();
  }
}

async function insertClosingArtifact(
  actorUserId: string,
  organizationId: string,
  patientId: string,
  sessionId: string,
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const [run] = await session.query<{ id: string }>(
      `insert into public.ai_runs
         (organization_id, patient_id, session_id, purpose, model, prompt_name, prompt_version, schema_version, status)
       values ($1, $2, $3, 'session_closing', 'gemini-test', 'sessionClosing', '1', '1', 'succeeded')
       returning id`,
      [organizationId, patientId, sessionId],
    );
    const [artifact] = await session.query<{ id: string }>(
      `insert into public.ai_artifacts (run_id, organization_id, type, structured_content)
       values ($1, $2, 'session_closing', $3::jsonb)
       returning id`,
      [run.id, organizationId, JSON.stringify(CLOSING_CONTENT)],
    );
    return artifact.id;
  } finally {
    await session.close();
  }
}

async function insertSupervisorArtifact(
  actorUserId: string,
  organizationId: string,
  patientId: string,
): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const [run] = await session.query<{ id: string }>(
      `insert into public.ai_runs
         (organization_id, patient_id, purpose, model, prompt_name, prompt_version, schema_version, status)
       values ($1, $2, 'supervisor', 'gemini-test', 'supervisor', '1', '1', 'succeeded')
       returning id`,
      [organizationId, patientId],
    );
    const [artifact] = await session.query<{ id: string }>(
      `insert into public.ai_artifacts (run_id, organization_id, type, structured_content)
       values ($1, $2, 'supervisor', $3::jsonb)
       returning id`,
      [run.id, organizationId, JSON.stringify(SUPERVISOR_CONTENT)],
    );
    return artifact.id;
  } finally {
    await session.close();
  }
}

describe("isolamento de artefatos de IA", () => {
  let adminA: string;
  let adminB: string;
  let secretary: string;
  let orgA: string;
  let orgB: string;
  let patientA: string;
  let patientB: string;
  let sessionA1: string;
  let sessionA2: string;
  let sessionB: string;

  beforeAll(async () => {
    adminA = await createAuthUser();
    adminB = await createAuthUser();
    secretary = await createAuthUser();
    orgA = await bootstrapOrganization(adminA, "Consultório Artefato A");
    orgB = await bootstrapOrganization(adminB, "Consultório Artefato B");
    await addMember(adminA, orgA, secretary, "secretary");

    patientA = await createPatient(adminA, orgA, "Paciente A");
    patientB = await createPatient(adminA, orgA, "Paciente B");
    await createPatient(adminB, orgB, "Paciente Org B");

    sessionA1 = await startSession(adminA, orgA, patientA);
    await finalizeSession(adminA, orgA, sessionA1);
    sessionA2 = await startSession(adminA, orgA, patientA);
    sessionB = await startSession(adminA, orgA, patientB);
  });

  it("rejeita artefato do paciente A na sessão do paciente B", async () => {
    const artifactId = await insertClosingArtifact(adminA, orgA, patientA, sessionA1);
    const session = await openSession({ userId: adminA });
    try {
      const error = await session.expectError(
        `select * from public.append_verified_ai_artifact_to_session($1, $2, 1, 'session_closing')`,
        [artifactId, sessionB],
      );
      expect(error).toMatch(/patient mismatch|isolation_violation/i);

      const dpep = await session.query(
        "select demand from public.session_dpep where session_id = $1",
        [sessionB],
      );
      expect(dpep).toEqual([]);

      const artifact = await session.query<{ review_status: string }>(
        "select review_status from public.ai_artifacts where id = $1",
        [artifactId],
      );
      expect(artifact[0].review_status).toBe("pending");
    } finally {
      await session.close();
    }
  });

  it("rejeita artefato da organização A na sessão da organização B", async () => {
    const artifactId = await insertClosingArtifact(adminA, orgA, patientA, sessionA1);
    const sessionBOrg = await startSession(adminB, orgB, await createPatient(adminB, orgB, "Alvo B"));
    const session = await openSession({ userId: adminB });
    try {
      const error = await session.expectError(
        `select * from public.append_verified_ai_artifact_to_session($1, $2, 1, 'session_closing')`,
        [artifactId, sessionBOrg],
      );
      expect(error).toMatch(/not found|isolation_violation|organization mismatch/i);
    } finally {
      await session.close();
    }
  });

  it("rejeita closing artifact da sessão A1 na sessão A2 do mesmo paciente", async () => {
    const artifactId = await insertClosingArtifact(adminA, orgA, patientA, sessionA1);
    const session = await openSession({ userId: adminA });
    try {
      const error = await session.expectError(
        `select * from public.append_verified_ai_artifact_to_session($1, $2, 1, 'session_closing')`,
        [artifactId, sessionA2],
      );
      expect(error).toMatch(/session-specific|isolation_violation/i);
    } finally {
      await session.close();
    }
  });

  it("anexa o artefato correto à sessão correta de forma atômica", async () => {
    const patient = await createPatient(adminA, orgA, "Paciente Sucesso");
    const targetSession = await startSession(adminA, orgA, patient);
    const artifactId = await insertClosingArtifact(adminA, orgA, patient, targetSession);
    const session = await openSession({ userId: adminA });
    try {
      const rows = await session.query<{ new_version: number }>(
        `select * from public.append_verified_ai_artifact_to_session($1, $2, 1, 'session_closing')`,
        [artifactId, targetSession],
      );
      expect(rows[0].new_version).toBe(2);

      const dpep = await session.query<{ demand: string }>(
        "select demand from public.session_dpep where session_id = $1",
        [targetSession],
      );
      expect(dpep[0].demand).toBe("Demanda gerada por IA");

      const artifact = await session.query<{ review_status: string }>(
        "select review_status from public.ai_artifacts where id = $1",
        [artifactId],
      );
      expect(artifact[0].review_status).toBe("appended");
    } finally {
      await session.close();
    }
  });

  it("rejeita UPDATE direto de review_status para appended (server action forjada)", async () => {
    const artifactId = await insertClosingArtifact(adminA, orgA, patientA, sessionA1);
    const session = await openSession({ userId: adminA });
    try {
      const error = await session.expectError(
        `update public.ai_artifacts set review_status = 'appended' where id = $1`,
        [artifactId],
      );
      expect(error).toMatch(/append_verified_ai_artifact_to_session/i);
    } finally {
      await session.close();
    }
  });

  it("rejeita chamada direta da RPC por secretária", async () => {
    const artifactId = await insertClosingArtifact(adminA, orgA, patientA, sessionA1);
    const session = await openSession({ userId: secretary });
    try {
      const error = await session.expectError(
        `select * from public.append_verified_ai_artifact_to_session($1, $2, 1, 'session_closing')`,
        [artifactId, sessionA1],
      );
      expect(error).toMatch(/not authorized|not found|permission/i);
    } finally {
      await session.close();
    }
  });

  it("Supervisor pode anexar em outra sessão do mesmo paciente, nunca de outro", async () => {
    const artifactId = await insertSupervisorArtifact(adminA, orgA, patientA);
    const session = await openSession({ userId: adminA });
    try {
      const [{ version }] = await session.query<{ version: number }>(
        "select version from public.clinical_sessions where id = $1",
        [sessionA2],
      );
      const ok = await session.query<{ new_version: number }>(
        `select * from public.append_verified_ai_artifact_to_session($1, $2, $3, 'supervisor', true, false)`,
        [artifactId, sessionA2, version],
      );
      expect(ok[0].new_version).toBe(version + 1);

      const otherArtifact = await insertSupervisorArtifact(adminA, orgA, patientA);
      const error = await session.expectError(
        `select * from public.append_verified_ai_artifact_to_session($1, $2, 1, 'supervisor', true, false)`,
        [otherArtifact, sessionB],
      );
      expect(error).toMatch(/patient mismatch|isolation_violation/i);
    } finally {
      await session.close();
    }
  });
});
