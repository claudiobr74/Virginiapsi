import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  bootstrapOrganization,
  createAuthUser,
  openSession,
} from "./support/db";

async function insertPatient(
  actorUserId: string,
  organizationId: string,
  preferredName: string,
): Promise<{ id: string; public_code: string }> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string; public_code: string }>(
      `insert into public.patients (organization_id, preferred_name, full_name)
       values ($1, $2, $2)
       returning id, public_code`,
      [organizationId, preferredName],
    );
    return rows[0];
  } finally {
    await session.close();
  }
}

describe("patients — administrativo", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Pacientes");
    await addMember(admin, organizationId, secretary, "secretary");
  });

  it("admin cria, lê e atualiza um paciente", async () => {
    const session = await openSession({ userId: admin });
    try {
      const inserted = await session.query<{ id: string; public_code: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name, phone)
         values ($1, 'Maria', 'Maria da Silva', '11999990000')
         returning id, public_code`,
        [organizationId],
      );
      expect(inserted[0].public_code).toMatch(/^PAC-\d{3,}$/);

      const updated = await session.query<{ status: string }>(
        `update public.patients set status = 'paused' where id = $1 returning status`,
        [inserted[0].id],
      );
      expect(updated[0].status).toBe("paused");

      const read = await session.query(
        "select id from public.patients where id = $1",
        [inserted[0].id],
      );
      expect(read).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it("secretária também tem CRUD administrativo em patients", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const inserted = await session.query<{ id: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name)
         values ($1, 'João', 'João Souza')
         returning id`,
        [organizationId],
      );
      expect(inserted).toHaveLength(1);

      const updated = await session.query<{ preferred_name: string }>(
        `update public.patients set preferred_name = 'João S.' where id = $1 returning preferred_name`,
        [inserted[0].id],
      );
      expect(updated[0].preferred_name).toBe("João S.");

      const listed = await session.query(
        "select id from public.patients where organization_id = $1",
        [organizationId],
      );
      expect(listed.length).toBeGreaterThan(0);
    } finally {
      await session.close();
    }
  });

  it("ninguém tem DELETE físico em patients", async () => {
    const patient = await insertPatient(admin, organizationId, "Delete Test");
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "delete from public.patients where id = $1",
        [patient.id],
      );
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("membro de outra organização não lê nem escreve pacientes de A", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Outro Consultório");
    const patient = await insertPatient(admin, organizationId, "Isolado");

    const session = await openSession({ userId: otherAdmin });
    try {
      const read = await session.query(
        "select id from public.patients where id = $1",
        [patient.id],
      );
      expect(read).toEqual([]);

      const write = await session.query(
        "update public.patients set status = 'archived' where id = $1 returning id",
        [patient.id],
      );
      expect(write).toEqual([]);

      const insertCrossTenant = await session.expectError(
        "insert into public.patients (organization_id, preferred_name, full_name) values ($1, 'Invasor', 'Invasor') returning id",
        [organizationId],
      );
      expect(insertCrossTenant).toMatch(/violates row-level security/i);
    } finally {
      await session.close();
    }

    void otherOrg;
  });

  it("elimination_status só muda por psychologist_admin", async () => {
    const patient = await insertPatient(admin, organizationId, "Elegível");

    const secretarySession = await openSession({ userId: secretary });
    try {
      const denied = await secretarySession.expectError(
        "update public.patients set elimination_status = 'elimination_requested' where id = $1",
        [patient.id],
      );
      expect(denied).toMatch(/only psychologist_admin/i);
    } finally {
      await secretarySession.close();
    }

    const adminSession = await openSession({ userId: admin });
    try {
      const allowed = await adminSession.query<{ elimination_status: string }>(
        "update public.patients set elimination_status = 'elimination_requested' where id = $1 returning elimination_status",
        [patient.id],
      );
      expect(allowed[0].elimination_status).toBe("elimination_requested");
    } finally {
      await adminSession.close();
    }
  });

  it("responsible_psychologist_user_id exige profissional clínica ativa da mesma organização", async () => {
    const patient = await insertPatient(admin, organizationId, "Responsável Teste");
    const stranger = await createAuthUser();

    const session = await openSession({ userId: admin });
    try {
      const errorStranger = await session.expectError(
        "update public.patients set responsible_psychologist_user_id = $2 where id = $1",
        [patient.id, stranger],
      );
      expect(errorStranger).toMatch(/active clinical practitioner/i);

      const errorSecretary = await session.expectError(
        "update public.patients set responsible_psychologist_user_id = $2 where id = $1",
        [patient.id, secretary],
      );
      expect(errorSecretary).toMatch(/active clinical practitioner/i);

      const ok = await session.query<{ responsible_psychologist_user_id: string }>(
        "update public.patients set responsible_psychologist_user_id = $2 where id = $1 returning responsible_psychologist_user_id",
        [patient.id, admin],
      );
      expect(ok[0].responsible_psychologist_user_id).toBe(admin);
    } finally {
      await session.close();
    }
  });
});

describe("public_code — atomicidade e imutabilidade", () => {
  it("nunca aceita o código enviado pelo cliente como autoridade", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Código");
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ public_code: string }>(
        `insert into public.patients (organization_id, preferred_name, full_name, public_code)
         values ($1, 'Forjado', 'Forjado', 'PAC-999')
         returning public_code`,
        [organizationId],
      );
      expect(rows[0].public_code).not.toBe("PAC-999");
      expect(rows[0].public_code).toBe("PAC-001");
    } finally {
      await session.close();
    }
  });

  it("é imutável após a criação", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Imutável");
    const patient = await insertPatient(admin, organizationId, "Imutável");

    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        "update public.patients set public_code = 'PAC-999' where id = $1",
        [patient.id],
      );
      expect(error).toMatch(/immutable/i);
    } finally {
      await session.close();
    }
  });

  it("organizações distintas podem ter PAC-001 de forma independente", async () => {
    const adminA = await createAuthUser();
    const adminB = await createAuthUser();
    const orgA = await bootstrapOrganization(adminA, "Consultório A Código");
    const orgB = await bootstrapOrganization(adminB, "Consultório B Código");

    const patientA = await insertPatient(adminA, orgA, "Primeiro A");
    const patientB = await insertPatient(adminB, orgB, "Primeiro B");

    expect(patientA.public_code).toBe("PAC-001");
    expect(patientB.public_code).toBe("PAC-001");
  });

  it("20+ inserções concorrentes na mesma organização não geram duplicidade", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(
      admin,
      "Consultório Concorrência",
    );

    const CONCURRENT_INSERTS = 25;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_INSERTS }, (_, index) =>
        insertPatient(admin, organizationId, `Concorrente ${index}`),
      ),
    );

    const codes = results.map((row) => row.public_code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(CONCURRENT_INSERTS);

    const expected = Array.from(
      { length: CONCURRENT_INSERTS },
      (_, index) => `PAC-${String(index + 1).padStart(3, "0")}`,
    );
    expect([...codes].sort()).toEqual(expected.sort());
  });
});

describe("patient_clinical_profile — somente psicóloga", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Clínico");
    await addMember(admin, organizationId, secretary, "secretary");
    const patient = await insertPatient(admin, organizationId, "Paciente Clínico");
    patientId = patient.id;
  });

  it("admin cria e lê o perfil clínico", async () => {
    const session = await openSession({ userId: admin });
    try {
      const inserted = await session.query<{ patient_id: string }>(
        `insert into public.patient_clinical_profile (patient_id, chief_complaint)
         values ($1, 'Ansiedade generalizada')
         returning patient_id`,
        [patientId],
      );
      expect(inserted[0].patient_id).toBe(patientId);

      const read = await session.query<{ chief_complaint: string }>(
        "select chief_complaint from public.patient_clinical_profile where patient_id = $1",
        [patientId],
      );
      expect(read[0].chief_complaint).toBe("Ansiedade generalizada");
    } finally {
      await session.close();
    }
  });

  it("secretária não lê, insere nem atualiza o perfil clínico — nem por ID direto", async () => {
    const session = await openSession({ userId: secretary });
    try {
      const read = await session.query(
        "select * from public.patient_clinical_profile where patient_id = $1",
        [patientId],
      );
      expect(read).toEqual([]);

      const listAll = await session.query(
        "select * from public.patient_clinical_profile",
      );
      expect(listAll).toEqual([]);

      const insertError = await session.expectError(
        "insert into public.patient_clinical_profile (patient_id, chief_complaint) values ($1, 'Forjado')",
        [patientId],
      );
      expect(insertError).toMatch(/violates row-level security/i);

      const updateResult = await session.query(
        "update public.patient_clinical_profile set chief_complaint = 'Forjado' where patient_id = $1 returning patient_id",
        [patientId],
      );
      expect(updateResult).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("organization_id do perfil clínico sempre acompanha o paciente, nunca o valor do cliente", async () => {
    const otherAdmin = await createAuthUser();
    const otherOrg = await bootstrapOrganization(otherAdmin, "Outro Clínico");

    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ organization_id: string }>(
        `insert into public.patient_clinical_profile (patient_id, organization_id, chief_complaint)
         values ($1, $2, 'Tentativa de forjar tenant')
         on conflict (patient_id) do update set chief_complaint = excluded.chief_complaint
         returning organization_id`,
        [patientId, otherOrg],
      );
      expect(rows[0].organization_id).toBe(organizationId);
    } finally {
      await session.close();
    }
  });

  it("admin de outra organização não acessa o perfil clínico de A", async () => {
    const otherAdmin = await createAuthUser();
    await bootstrapOrganization(otherAdmin, "Terceiro Clínico");

    const session = await openSession({ userId: otherAdmin });
    try {
      const read = await session.query(
        "select * from public.patient_clinical_profile where patient_id = $1",
        [patientId],
      );
      expect(read).toEqual([]);
    } finally {
      await session.close();
    }
  });
});
