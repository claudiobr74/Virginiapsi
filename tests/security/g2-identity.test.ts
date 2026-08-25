import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  ensurePlatformOperator,
  openSession,
} from "./support/db";

describe("G2 identity — D4b / D5b / convites", () => {
  let admin: string;
  let psychologist: string;
  let otherPsychologist: string;
  let secretary: string;
  let organizationId: string;
  let ownPatientId: string;
  let colleaguePatientId: string;

  beforeAll(async () => {
    admin = await createAuthUser("admin-g2@tesseli.test");
    psychologist = await createAuthUser("psi-g2@tesseli.test");
    otherPsychologist = await createAuthUser("psi2-g2@tesseli.test");
    secretary = await createAuthUser("sec-g2@tesseli.test");
    organizationId = await bootstrapOrganization(admin, "Clínica G2");
    await addMember(admin, organizationId, psychologist, "psychologist");
    await addMember(admin, organizationId, otherPsychologist, "psychologist");
    await addMember(admin, organizationId, secretary, "secretary");

    const adminSession = await openSession({ userId: admin });
    try {
      const colleague = await adminSession.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name, responsible_psychologist_user_id)
         values ($1, 'Paciente Colega', 'Paciente Colega', $2)
         returning id`,
        [organizationId, otherPsychologist],
      );
      colleaguePatientId = colleague[0].id;
    } finally {
      await adminSession.close();
    }

    const psiSession = await openSession({ userId: psychologist });
    try {
      const own = await psiSession.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name)
         values ($1, 'Paciente Próprio', 'Paciente Próprio')
         returning id`,
        [organizationId],
      );
      ownPatientId = own[0].id;
    } finally {
      await psiSession.close();
    }
  });

  it("autenticado comum não faz bootstrap depois que a allowlist existe", async () => {
    const outsider = await createAuthUser("outsider-g2@tesseli.test");
    const session = await openSession({ userId: outsider });
    try {
      const error = await session.expectError(
        "select public.bootstrap_organization($1, $2)",
        ["Invasor", `invasor-${outsider.slice(0, 8)}`],
      );
      expect(error).toMatch(/platform operator/i);
    } finally {
      await session.close();
    }
  });

  it("claim_platform_operator só captura a mesa vazia", async () => {
    const outsider = await createAuthUser("claim-g2@tesseli.test");
    const session = await openSession({ userId: outsider });
    try {
      const claimed = await session.query<{ claim_platform_operator: boolean }>(
        "select public.claim_platform_operator() as claim_platform_operator",
      );
      expect(claimed[0].claim_platform_operator).toBe(false);
    } finally {
      await session.close();
    }
  });

  it("psicóloga lê só os seus pacientes e o próprio clínico", async () => {
    const session = await openSession({ userId: psychologist });
    try {
      const listed = await session.query<{ id: string }>(
        "select id from public.patients where organization_id = $1",
        [organizationId],
      );
      expect(listed.map((row) => row.id)).toEqual([ownPatientId]);

      const hidden = await session.query(
        "select id from public.patients where id = $1",
        [colleaguePatientId],
      );
      expect(hidden).toEqual([]);

      const inserted = await session.query<{ patient_id: string }>(
        `insert into public.patient_clinical_profile (patient_id, chief_complaint)
         values ($1, 'Queixa própria')
         returning patient_id`,
        [ownPatientId],
      );
      expect(inserted[0].patient_id).toBe(ownPatientId);

      const denied = await session.expectError(
        `insert into public.patient_clinical_profile (patient_id, chief_complaint)
         values ($1, 'Queixa alheia')`,
        [colleaguePatientId],
      );
      expect(denied).toMatch(/row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("psicóloga abre sessão e grava DPEP só no próprio paciente", async () => {
    const session = await openSession({ userId: psychologist });
    try {
      const started = await session.query<{ start_clinical_session: string }>(
        "select public.start_clinical_session($1, $2) as start_clinical_session",
        [organizationId, ownPatientId],
      );
      expect(started[0].start_clinical_session).toMatch(/^[0-9a-f-]{36}$/i);

      const dpep = await session.query<{ new_version: number }>(
        `select * from public.save_session_dpep($1, $2, 1, 'Demanda própria', 'Proc', 'Evo', 'Plano')`,
        [started[0].start_clinical_session, organizationId],
      );
      expect(dpep[0].new_version).toBe(2);

      const notes = await session.query<{ new_version: number }>(
        `select * from public.save_session_working_notes($1, $2, 2, 'Formulação', 'Hipótese', 'Obs')`,
        [started[0].start_clinical_session, organizationId],
      );
      expect(notes[0].new_version).toBe(3);

      const deniedSession = await session.expectError(
        "select public.start_clinical_session($1, $2)",
        [organizationId, colleaguePatientId],
      );
      expect(deniedSession).toMatch(/row-level security/i);
    } finally {
      await session.close();
    }
  });

  it("administradora não lê o clínico de paciente de outra psicóloga", async () => {
    let sessionId: string;
    const owner = await openSession({ userId: otherPsychologist });
    try {
      await owner.query(
        `insert into public.patient_clinical_profile (patient_id, chief_complaint)
         values ($1, 'Queixa da colega')`,
        [colleaguePatientId],
      );
      const started = await owner.query<{ start_clinical_session: string }>(
        "select public.start_clinical_session($1, $2) as start_clinical_session",
        [organizationId, colleaguePatientId],
      );
      sessionId = started[0].start_clinical_session;
      await owner.query(
        `select * from public.save_session_dpep($1, $2, 1, 'Demanda', 'Procedimento', 'Evolução', 'Plano')`,
        [sessionId, organizationId],
      );
      await owner.query(
        `select * from public.save_session_working_notes($1, $2, 2, 'Formulação', 'Hipótese', 'Obs')`,
        [sessionId, organizationId],
      );
      await owner.query(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Laudo colega', 'laudo', 'clinical')`,
        [organizationId, colleaguePatientId],
      );
      await owner.query(
        `insert into public.session_transcript_segments
           (session_id, organization_id, sequence, text, is_final, provider)
         values ($1, $2, 0, 'Transcrição da colega', true, 'local-webgpu')`,
        [sessionId, organizationId],
      );
      const run = await owner.query<{ id: string }>(
        `insert into public.ai_runs
           (organization_id, patient_id, session_id, purpose, model, prompt_name, prompt_version, schema_version, status)
         values ($1, $2, $3, 'session_live', 'gemini-test', 'sessionLive', '1.2.0', '1', 'succeeded')
         returning id`,
        [organizationId, colleaguePatientId, sessionId],
      );
      await owner.query(
        `insert into public.ai_artifacts (run_id, organization_id, type, structured_content)
         values ($1, $2, 'session_live', '{"summarySoFar": "colega"}'::jsonb)`,
        [run[0].id, organizationId],
      );
    } finally {
      await owner.close();
    }

    const session = await openSession({ userId: admin });
    try {
      const cadastro = await session.query<{ id: string }>(
        "select id from public.patients where id = $1",
        [colleaguePatientId],
      );
      expect(cadastro).toHaveLength(1);

      const clinical = await session.query(
        "select chief_complaint from public.patient_clinical_profile where patient_id = $1",
        [colleaguePatientId],
      );
      expect(clinical).toEqual([]);

      const insertDenied = await session.expectError(
        `insert into public.patient_clinical_profile (patient_id, chief_complaint)
         values ($1, 'Admin não é responsável')`,
        [colleaguePatientId],
      );
      expect(insertDenied).toMatch(/row-level security/i);

      const sessions = await session.query(
        "select id from public.clinical_sessions where patient_id = $1",
        [colleaguePatientId],
      );
      expect(sessions).toEqual([]);

      const dpep = await session.query(
        "select session_id from public.session_dpep where session_id = $1",
        [sessionId],
      );
      expect(dpep).toEqual([]);

      const notes = await session.query(
        "select session_id from public.session_clinical_working_notes where session_id = $1",
        [sessionId],
      );
      expect(notes).toEqual([]);

      const docs = await session.query(
        "select id from public.documents where patient_id = $1 and sensitivity = 'clinical'",
        [colleaguePatientId],
      );
      expect(docs).toEqual([]);

      const transcripts = await session.query(
        "select id from public.session_transcript_segments where session_id = $1",
        [sessionId],
      );
      expect(transcripts).toEqual([]);

      const runs = await session.query(
        "select id from public.ai_runs where patient_id = $1",
        [colleaguePatientId],
      );
      expect(runs).toEqual([]);

      const artifacts = await session.query(
        "select id from public.ai_artifacts where organization_id = $1",
        [organizationId],
      );
      expect(artifacts).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("secretária lê cadastro e não lê clínico já existente", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const patients = await session.query<{ id: string }>(
        "select id from public.patients where organization_id = $1",
        [organizationId],
      );
      expect(patients.map((row) => row.id)).toEqual(
        expect.arrayContaining([ownPatientId, colleaguePatientId]),
      );

      const clinical = await session.query(
        "select * from public.patient_clinical_profile where patient_id in ($1, $2)",
        [ownPatientId, colleaguePatientId],
      );
      expect(clinical).toEqual([]);

      const sessions = await session.query(
        "select id from public.clinical_sessions where organization_id = $1",
        [organizationId],
      );
      expect(sessions).toEqual([]);

      const dpep = await session.query(
        "select session_id from public.session_dpep where organization_id = $1",
        [organizationId],
      );
      expect(dpep).toEqual([]);

      const notes = await session.query(
        "select session_id from public.session_clinical_working_notes where organization_id = $1",
        [organizationId],
      );
      expect(notes).toEqual([]);

      const docs = await session.query(
        "select id from public.documents where organization_id = $1 and sensitivity = 'clinical'",
        [organizationId],
      );
      expect(docs).toEqual([]);

      const transcripts = await session.query(
        "select id from public.session_transcript_segments where organization_id = $1",
        [organizationId],
      );
      expect(transcripts).toEqual([]);

      const runs = await session.query(
        "select id from public.ai_runs where organization_id = $1",
        [organizationId],
      );
      expect(runs).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("administradora lê o clínico se for a responsável", async () => {
    const session = await openSession({ userId: admin });
    try {
      const patient = await session.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name)
         values ($1, 'Paciente da Admin', 'Paciente da Admin')
         returning id`,
        [organizationId],
      );
      const profile = await session.query<{ chief_complaint: string }>(
        `insert into public.patient_clinical_profile (patient_id, chief_complaint)
         values ($1, 'Queixa da admin')
         returning chief_complaint`,
        [patient[0].id],
      );
      expect(profile[0].chief_complaint).toBe("Queixa da admin");
    } finally {
      await session.close();
    }
  });

  it("convite de e-mail novo fica pendente e aceita no login", async () => {
    const inviteeEmail = "nova-g2@tesseli.test";
    const adminSession = await openSession({ userId: admin });
    try {
      const invitation = await adminSession.query<{ invite_organization_member: string }>(
        "select public.invite_organization_member($1, $2, 'psychologist') as invite_organization_member",
        [organizationId, inviteeEmail],
      );
      expect(invitation[0].invite_organization_member).toMatch(/^[0-9a-f-]{36}$/i);

      const pending = await adminSession.query<{ status: string; email: string }>(
        "select status, email from public.organization_invitations where organization_id = $1 and email = $2",
        [organizationId, inviteeEmail],
      );
      expect(pending[0].status).toBe("pending");
    } finally {
      await adminSession.close();
    }

    const invitee = await createAuthUser(inviteeEmail);
    const inviteeSession = await openSession({ userId: invitee });
    try {
      const accepted = await inviteeSession.query<{ accept_pending_invitations: number }>(
        "select public.accept_pending_invitations() as accept_pending_invitations",
      );
      expect(accepted[0].accept_pending_invitations).toBe(1);

      const memberships = await inviteeSession.query<{ role: string }>(
        "select role from public.organization_members where organization_id = $1 and user_id = $2",
        [organizationId, invitee],
      );
      expect(memberships[0].role).toBe("psychologist");
    } finally {
      await inviteeSession.close();
    }
  });

  it("convite de e-mail já membro de outra org adiciona membership nesta", async () => {
    const shared = await createAuthUser("shared-g2@tesseli.test");
    const otherOrg = await bootstrapOrganization(shared, "Outra Clínica G2");
    void otherOrg;

    const session = await openSession({ userId: admin });
    try {
      const id = await session.query<{ invite_organization_member: string }>(
        "select public.invite_organization_member($1, $2, 'secretary') as invite_organization_member",
        [organizationId, "shared-g2@tesseli.test"],
      );
      expect(id[0].invite_organization_member).toMatch(/^[0-9a-f-]{36}$/i);
    } finally {
      await session.close();
    }

    const sharedSession = await openSession({ userId: shared });
    try {
      const roles = await sharedSession.query<{ organization_id: string; role: string }>(
        "select organization_id, role from public.organization_members where user_id = $1",
        [shared],
      );
      expect(roles).toHaveLength(2);
      expect(roles.some((row) => row.organization_id === organizationId && row.role === "secretary")).toBe(
        true,
      );
    } finally {
      await sharedSession.close();
    }
  });

  it("usuário A+B admin das duas clínicas não lê clínico de A se não for responsável (D4b)", async () => {
    const sharedAdmin = await createAuthUser("ab-g2@tesseli.test");
    const orgB = await bootstrapOrganization(sharedAdmin, "Org B G2");
    await addMember(admin, organizationId, sharedAdmin, "psychologist_admin");

    const session = await openSession({ userId: sharedAdmin });
    try {
      const clinicalA = await session.query(
        "select * from public.patient_clinical_profile where patient_id = $1",
        [ownPatientId],
      );
      expect(clinicalA).toEqual([]);

      const orgs = await session.query<{ id: string }>("select id from public.organizations");
      expect(orgs.map((row) => row.id).sort()).toEqual([organizationId, orgB].sort());
    } finally {
      await session.close();
    }
  });

  it("membro só da clínica B não lê cadastro nem clínico da clínica A", async () => {
    const adminB = await createAuthUser("tenant-b-g2@tesseli.test");
    const orgB = await bootstrapOrganization(adminB, "Clínica Isolada B");
    void orgB;

    const session = await openSession({ userId: adminB });
    try {
      const patients = await session.query(
        "select id from public.patients where id = $1",
        [colleaguePatientId],
      );
      expect(patients).toEqual([]);

      const clinical = await session.query(
        "select * from public.patient_clinical_profile where patient_id = $1",
        [colleaguePatientId],
      );
      expect(clinical).toEqual([]);

      const sessions = await session.query(
        "select id from public.clinical_sessions where patient_id = $1",
        [colleaguePatientId],
      );
      expect(sessions).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("psychologist_admin da clínica sem allowlist não cria outra clínica (D5b)", async () => {
    const clinicAdmin = await createAuthUser("clinic-admin-d5b@tesseli.test");
    await addMember(admin, organizationId, clinicAdmin, "psychologist_admin");

    const session = await openSession({ userId: clinicAdmin });
    try {
      const operators = await session.query(
        "select user_id from public.platform_operators where user_id = $1",
        [clinicAdmin],
      );
      expect(operators).toEqual([]);

      const error = await session.expectError(
        "select public.bootstrap_organization($1, $2)",
        ["Outra Clínica", `outra-${clinicAdmin.slice(0, 8)}`],
      );
      expect(error).toMatch(/platform operator/i);
    } finally {
      await session.close();
    }
  });
});

describe("G2 helpers", () => {
  const g2StableHelpers = [
    "is_platform_operator",
    "platform_bootstrap_state",
    "is_clinical_practitioner",
    "can_manage_org_patients",
    "can_access_patient_record",
    "can_access_patient_clinical",
    "can_access_clinical_session",
    "can_access_document",
  ] as const;

  it("helpers G2 de policy são STABLE DEFINER com search_path vazio", async () => {
    const session = await openSession({ userId: await createAuthUser() });
    try {
      const rows = await session.query<{
        proname: string;
        provolatile: string;
        prosecdef: boolean;
        proconfig: string[] | null;
      }>(
        `select p.proname, p.provolatile, p.prosecdef, p.proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in (${g2StableHelpers.map((name) => `'${name}'`).join(", ")})
         order by p.proname`,
      );
      expect(rows).toHaveLength(g2StableHelpers.length);
      for (const row of rows) {
        expect(row.provolatile, `${row.proname} deve ser STABLE`).toBe("s");
        expect(row.prosecdef, `${row.proname} deve ser SECURITY DEFINER`).toBe(true);
        expect(
          row.proconfig,
          `${row.proname} deve fixar search_path vazio`,
        ).toContain('search_path=""');
      }
    } finally {
      await session.close();
    }
  });

  it("helpers G2 não concedem EXECUTE a public nem a anon", async () => {
    const session = await openSession({ userId: await createAuthUser() });
    try {
      const rows = await session.query<{ proname: string; grantee: string }>(
        `select p.proname, a.grantee::regrole::text as grantee
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join aclexplode(p.proacl) a
         where n.nspname = 'public'
           and p.proname in (
             'is_platform_operator',
             'platform_bootstrap_state',
             'claim_platform_operator',
             'add_platform_operator',
             'is_clinical_practitioner',
             'can_manage_org_patients',
             'can_access_patient_record',
             'can_access_patient_clinical',
             'can_access_clinical_session',
             'can_access_document',
             'invite_organization_member',
             'accept_pending_invitations',
             'bootstrap_organization'
           )
           and a.privilege_type = 'EXECUTE'`,
      );

      const grantees = new Set(rows.map((row) => row.grantee));
      expect(grantees.has("anon")).toBe(false);
      expect(grantees.has("-")).toBe(false);
      expect(grantees.has("authenticated")).toBe(true);
    } finally {
      await session.close();
    }
  });

  it("tabelas clínicas não retêm policy *_admin_* leftover", async () => {
    const session = await openSession({ userId: await createAuthUser() });
    try {
      const leftover = await session.query<{ tablename: string; policyname: string }>(
        `select tablename, policyname
         from pg_policies
         where schemaname = 'public'
           and tablename in (
             'patient_clinical_profile',
             'clinical_sessions',
             'session_dpep',
             'session_clinical_working_notes',
             'session_transcript_segments',
             'session_transcript_artifacts',
             'ai_runs',
             'ai_artifacts'
           )
           and policyname like '%_admin_%'
         order by tablename, policyname`,
      );
      expect(leftover).toEqual([]);

      const storageAdmin = await session.query<{ policyname: string }>(
        `select policyname
         from pg_policies
         where schemaname = 'storage'
           and tablename = 'objects'
           and policyname = 'knowledge_sources_storage_admin_all'`,
      );
      expect(storageAdmin).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("ensurePlatformOperator é idempotente", async () => {
    const user = await createAuthUser();
    await ensurePlatformOperator(user);
    await ensurePlatformOperator(user);
    const session = await openSession({ userId: user });
    try {
      const rows = await session.query<{ is_platform_operator: boolean }>(
        "select public.is_platform_operator() as is_platform_operator",
      );
      expect(rows[0].is_platform_operator).toBe(true);
    } finally {
      await session.close();
    }
  });
});
