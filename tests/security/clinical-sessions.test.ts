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
  name = "Paciente Sessão",
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

describe("clinical_sessions — sessão clínica", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Sessão Clínica");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId);
  });

  it("admin inicia sessão e a autoria vem de auth.uid()", async () => {
    const sessionId = await startSession(admin, organizationId, patientId);
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{
        status: string;
        therapist_user_id: string;
        started_at: string;
        version: number;
      }>(
        "select status, therapist_user_id, started_at, version from public.clinical_sessions where id = $1",
        [sessionId],
      );
      expect(rows[0].status).toBe("in_progress");
      expect(rows[0].therapist_user_id).toBe(admin);
      expect(rows[0].started_at).toBeTruthy();
      expect(rows[0].version).toBe(1);
    } finally {
      await session.close();
    }
  });

  it("iniciar sessão de novo para o mesmo paciente resume a sessão em aberto, não duplica", async () => {
    const other = await createPatient(admin, organizationId, "Paciente Resume");
    const first = await startSession(admin, organizationId, other);
    const second = await startSession(admin, organizationId, other);
    expect(second).toBe(first);

    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ count: string }>(
        `select count(*)::text as count from public.clinical_sessions
         where organization_id = $1 and patient_id = $2`,
        [organizationId, other],
      );
      expect(rows[0].count).toBe("1");
    } finally {
      await session.close();
    }
  });

  it("secretária não lê nem cria sessão clínica", async () => {
    const sessionId = await startSession(admin, organizationId, patientId);

    const session = await openSession({ userId: secretary });
    try {
      const read = await session.query(
        "select id from public.clinical_sessions where id = $1",
        [sessionId],
      );
      expect(read).toEqual([]);

      const error = await session.expectError(
        "select public.start_clinical_session($1, $2)",
        [organizationId, patientId],
      );
      expect(error).toMatch(/only psychologist_admin|violates row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("paciente do agendamento e da sessão precisam ser da mesma organização", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Consultório B Sessão");
    const otherPatient = await createPatient(otherAdmin, otherOrg, "Paciente de B");

    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.clinical_sessions (organization_id, patient_id, status)
         values ($1, $2, 'draft')`,
        [organizationId, otherPatient],
      );
      expect(error).toMatch(/same organization/i);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não lê nem escreve a sessão de A", async () => {
    const sessionId = await startSession(admin, organizationId, patientId);
    const outsider = await createAuthUser();
    await bootstrapOrganization(outsider, "Consultório Isolado Sessão");

    const session = await openSession({ userId: outsider });
    try {
      const read = await session.query(
        "select id from public.clinical_sessions where id = $1",
        [sessionId],
      );
      expect(read).toEqual([]);

      const write = await session.query(
        "update public.clinical_sessions set status = 'canceled' where id = $1 returning id",
        [sessionId],
      );
      expect(write).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("ninguém apaga fisicamente uma sessão clínica", async () => {
    const sessionId = await startSession(admin, organizationId, patientId);
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "delete from public.clinical_sessions where id = $1",
        [sessionId],
      );
      expect(error).toMatch(/permission denied|violates row-level security/i);
    } finally {
      await session.close();
    }
  });
});

describe("finalize_clinical_session — idempotência", () => {
  it("finaliza uma vez e a repetição com a mesma chave é no-op bem-sucedido", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Finalização");
    const patientId = await createPatient(admin, organizationId);
    const sessionId = await startSession(admin, organizationId, patientId);
    const key = randomUUID();

    const session = await openSession({ userId: admin });
    try {
      const first = await session.query<{ out_status: string; out_ended_at: string }>(
        "select * from public.finalize_clinical_session($1, $2, $3)",
        [sessionId, organizationId, key],
      );
      expect(first[0].out_status).toBe("finalized");
      const firstEndedAt = first[0].out_ended_at;

      const second = await session.query<{ out_status: string; out_ended_at: string }>(
        "select * from public.finalize_clinical_session($1, $2, $3)",
        [sessionId, organizationId, key],
      );
      expect(second[0].out_status).toBe("finalized");
      expect(second[0].out_ended_at).toEqual(firstEndedAt);
    } finally {
      await session.close();
    }
  });

  it("duas chaves de idempotência distintas não finalizam duas vezes com efeitos diferentes", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Finalização 2");
    const patientId = await createPatient(admin, organizationId);
    const sessionId = await startSession(admin, organizationId, patientId);

    const session = await openSession({ userId: admin });
    try {
      await session.query(
        "select public.finalize_clinical_session($1, $2, $3)",
        [sessionId, organizationId, randomUUID()],
      );

      const secondAttempt = await session.query(
        "select * from public.finalize_clinical_session($1, $2, $3)",
        [sessionId, organizationId, randomUUID()],
      );
      // Already finalized with a different key: no row updated (no-op, not an error).
      expect(secondAttempt).toEqual([]);
    } finally {
      await session.close();
    }
  });
});

describe("save_session_dpep — concorrência otimista", () => {
  let admin: string;
  let organizationId: string;
  let sessionId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório DPEP");
    const patientId = await createPatient(admin, organizationId);
    sessionId = await startSession(admin, organizationId, patientId);
  });

  it("grava com a versão correta e bumpa clinical_sessions.version", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ new_version: number }>(
        `select * from public.save_session_dpep($1, $2, 1, 'Demanda', 'Proc', 'Evo', 'Plano')`,
        [sessionId, organizationId],
      );
      expect(rows[0].new_version).toBe(2);

      const dpep = await session.query<{ demand: string; version: number }>(
        "select demand, version from public.session_dpep where session_id = $1",
        [sessionId],
      );
      expect(dpep[0]).toEqual({ demand: "Demanda", version: 2 });

      const clinicalSession = await session.query<{ version: number }>(
        "select version from public.clinical_sessions where id = $1",
        [sessionId],
      );
      expect(clinicalSession[0].version).toBe(2);
    } finally {
      await session.close();
    }
  });

  it("grava com versão desatualizada não retorna linha (conflito 409 na borda do app)", async () => {
    const session = await openSession({ userId: admin });
    try {
      const stale = await session.query(
        `select * from public.save_session_dpep($1, $2, 1, 'Outra', 'X', 'Y', 'Z')`,
        [sessionId, organizationId],
      );
      expect(stale).toEqual([]);

      // O conteúdo anterior (gravado com a versão correta) permanece intacto.
      const dpep = await session.query<{ demand: string }>(
        "select demand from public.session_dpep where session_id = $1",
        [sessionId],
      );
      expect(dpep[0].demand).toBe("Demanda");
    } finally {
      await session.close();
    }
  });

  it("secretária não grava DPEP mesmo informando a versão certa", async () => {
    const secretary = await createAuthUser();
    await addMember(admin, organizationId, secretary, "secretary");

    const session = await openSession({ userId: secretary });
    try {
      const rows = await session.query(
        `select * from public.save_session_dpep($1, $2, 2, 'Hack', 'X', 'Y', 'Z')`,
        [sessionId, organizationId],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });
});

describe("save_session_working_notes — área de trabalho clínico separada", () => {
  it("grava com a versão correta e nunca aparece para a secretária", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Working Notes");
    await addMember(admin, organizationId, secretary, "secretary");
    const patientId = await createPatient(admin, organizationId);
    const sessionId = await startSession(admin, organizationId, patientId);

    const adminSession = await openSession({ userId: admin });
    try {
      const rows = await adminSession.query<{ new_version: number }>(
        `select * from public.save_session_working_notes($1, $2, 1, 'Formulação X', 'Hipótese Y', 'Observação Z')`,
        [sessionId, organizationId],
      );
      expect(rows[0].new_version).toBe(2);
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const read = await secretarySession.query(
        "select * from public.session_clinical_working_notes where session_id = $1",
        [sessionId],
      );
      expect(read).toEqual([]);

      const error = await secretarySession.expectError(
        `insert into public.session_clinical_working_notes (session_id, organization_id, formulation)
         values ($1, $2, 'forjado')`,
        [sessionId, organizationId],
      );
      expect(error).toMatch(/violates row-level security/i);
    } finally {
      await secretarySession.close();
    }
  });
});

describe("session_transcript_segments — append-only e idempotente por sequence", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let sessionId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Transcrição");
    await addMember(admin, organizationId, secretary, "secretary");
    const patientId = await createPatient(admin, organizationId);
    sessionId = await startSession(admin, organizationId, patientId);
  });

  it("admin insere segmentos finais em sequência", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ id: string }>(
        `insert into public.session_transcript_segments
           (session_id, organization_id, sequence, text, is_final, provider)
         values ($1, $2, 0, 'Olá, como você está?', true, 'local-webgpu')
         returning id`,
        [sessionId, organizationId],
      );
      expect(rows).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it("sequence duplicada na mesma sessão é rejeitada (upsert idempotente fica a cargo do app)", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.session_transcript_segments
           (session_id, organization_id, sequence, text, is_final, provider)
         values ($1, $2, 0, 'Duplicado', true, 'local-webgpu')`,
        [sessionId, organizationId],
      );
      expect(error).toMatch(/duplicate key|unique/i);
    } finally {
      await session.close();
    }
  });

  it("ninguém edita ou apaga um segmento já persistido", async () => {
    const session = await openSession({ userId: admin });
    try {
      const updateError = await session.expectError(
        "update public.session_transcript_segments set text = 'editado' where session_id = $1 and sequence = 0",
        [sessionId],
      );
      expect(updateError).toMatch(/permission denied/i);

      const deleteError = await session.expectError(
        "delete from public.session_transcript_segments where session_id = $1 and sequence = 0",
        [sessionId],
      );
      expect(deleteError).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("secretária não lê nem insere segmento de transcrição", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const read = await session.query(
        "select id from public.session_transcript_segments where session_id = $1",
        [sessionId],
      );
      expect(read).toEqual([]);

      const error = await session.expectError(
        `insert into public.session_transcript_segments
           (session_id, organization_id, sequence, text, is_final, provider)
         values ($1, $2, 1, 'forjado', true, 'local-webgpu')`,
        [sessionId, organizationId],
      );
      expect(error).toMatch(/violates row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("provider fora do vocabulário conhecido é rejeitado", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.session_transcript_segments
           (session_id, organization_id, sequence, text, is_final, provider)
         values ($1, $2, 2, 'texto', true, 'deepgram')`,
        [sessionId, organizationId],
      );
      expect(error).toMatch(/check/i);
    } finally {
      await session.close();
    }
  });
});

describe("ai_runs / ai_artifacts — draft até revisão explícita", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let sessionId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório AI Runs");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId);
    sessionId = await startSession(admin, organizationId, patientId);
  });

  it("cria ai_run com autoria forçada e liga artifact em estado pending", async () => {
    const session = await openSession({ userId: admin });
    try {
      const runRows = await session.query<{ id: string; actor_user_id: string }>(
        `insert into public.ai_runs
           (organization_id, patient_id, session_id, purpose, model, prompt_name, prompt_version, schema_version, status)
         values ($1, $2, $3, 'session_live', 'gemini-test', 'sessionLive', '1.2.0', '1', 'succeeded')
         returning id, actor_user_id`,
        [organizationId, patientId, sessionId],
      );
      expect(runRows[0].actor_user_id).toBe(admin);

      const artifactRows = await session.query<{
        review_status: string;
        reviewed_at: string | null;
      }>(
        `insert into public.ai_artifacts (run_id, organization_id, type, structured_content)
         values ($1, $2, 'session_live', '{"summarySoFar": "teste"}'::jsonb)
         returning review_status, reviewed_at`,
        [runRows[0].id, organizationId],
      );
      expect(artifactRows[0].review_status).toBe("pending");
      expect(artifactRows[0].reviewed_at).toBeNull();
    } finally {
      await session.close();
    }
  });

  it("secretária não lê ai_runs nem ai_artifacts", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const runs = await session.query(
        "select id from public.ai_runs where organization_id = $1",
        [organizationId],
      );
      expect(runs).toEqual([]);

      const artifacts = await session.query(
        `select aa.id from public.ai_artifacts aa
         join public.ai_runs ar on ar.id = aa.run_id
         where ar.organization_id = $1`,
        [organizationId],
      );
      expect(artifacts).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("revisar um artifact carimba reviewed_by/reviewed_at e trava o conteúdo estruturado", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [run] = await session.query<{ id: string }>(
        `insert into public.ai_runs
           (organization_id, patient_id, session_id, purpose, model, prompt_name, prompt_version, schema_version, status)
         values ($1, $2, $3, 'session_closing', 'gemini-test', 'sessionClosing', '1.2.0', '1', 'succeeded')
         returning id`,
        [organizationId, patientId, sessionId],
      );
      const [artifact] = await session.query<{ id: string }>(
        `insert into public.ai_artifacts (run_id, organization_id, type, structured_content)
         values ($1, $2, 'session_closing', '{"dpepDraft": {}}'::jsonb)
         returning id`,
        [run.id, organizationId],
      );

      const appended = await session.query<{
        review_status: string;
        reviewed_by: string;
        reviewed_at: string;
      }>(
        `update public.ai_artifacts set review_status = 'appended'
         where id = $1
         returning review_status, reviewed_by, reviewed_at`,
        [artifact.id],
      );
      expect(appended[0].review_status).toBe("appended");
      expect(appended[0].reviewed_by).toBe(admin);
      expect(appended[0].reviewed_at).toBeTruthy();

      // Content is immutable once produced.
      const tampered = await session.query<{ structured_content: unknown }>(
        `update public.ai_artifacts set structured_content = '{"hacked": true}'::jsonb
         where id = $1
         returning structured_content`,
        [artifact.id],
      );
      expect(tampered[0].structured_content).toEqual({ dpepDraft: {} });

      // Cannot flip an already-reviewed artifact back/around.
      const error = await session.expectError(
        "update public.ai_artifacts set review_status = 'discarded' where id = $1",
        [artifact.id],
      );
      expect(error).toMatch(/cannot change once reviewed/i);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não lê ai_runs/ai_artifacts de A", async () => {
    const [run] = await (async () => {
      const session = await openSession({ userId: admin });
      try {
        return await session.query<{ id: string }>(
          `insert into public.ai_runs
             (organization_id, patient_id, session_id, purpose, model, prompt_name, prompt_version, schema_version, status)
           values ($1, $2, $3, 'session_preparation', 'gemini-test', 'sessionPreparation', '1.2.0', '1', 'succeeded')
           returning id`,
          [organizationId, patientId, sessionId],
        );
      } finally {
        await session.close();
      }
    })();

    const outsider = await createAuthUser();
    await bootstrapOrganization(outsider, "Consultório Isolado AI");
    const session = await openSession({ userId: outsider });
    try {
      const rows = await session.query(
        "select id from public.ai_runs where id = $1",
        [run.id],
      );
      expect(rows).toEqual([]);
    } finally {
      await session.close();
    }
  });
});

describe("session-audio-fallback — sem INSERT genérico por membership", () => {
  it("nenhum papel de aplicação tem GRANT em storage.objects", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Fallback Storage");
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into storage.objects (bucket_id, name) values ('session-audio-fallback', $1)`,
        [`${organizationId}/fake.webm`],
      );
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });
});
