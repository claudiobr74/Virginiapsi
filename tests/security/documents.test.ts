import { beforeAll, describe, expect, it } from "vitest";
import { addMember, bootstrapOrganization, createAuthUser, openSession } from "./support/db";

async function createPatient(actorUserId: string, organizationId: string): Promise<string> {
  const session = await openSession({ userId: actorUserId });
  try {
    const rows = await session.query<{ id: string }>(
      `insert into public.patients (organization_id, preferred_name, full_name, birth_date)
       values ($1, 'Paciente Documentos', 'Paciente Documentos', '1990-01-01') returning id`,
      [organizationId],
    );
    return rows[0].id;
  } finally {
    await session.close();
  }
}

describe("documents — sensibilidade obrigatória e derivação por document_kind", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Documentos");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId);
  });

  it("laudo/relatório/atestado/encaminhamento nascem 'clinical' mesmo se outro valor for enviado", async () => {
    const session = await openSession({ userId: admin });
    try {
      for (const kind of ["laudo", "relatorio", "atestado", "encaminhamento"]) {
        const rows = await session.query<{ sensitivity: string }>(
          `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
           values ($1, $2, $3, $4, 'administrative') returning sensitivity`,
          [organizationId, patientId, `Doc ${kind}`, kind],
        );
        expect(rows[0].sensitivity).toBe("clinical");
      }
    } finally {
      await session.close();
    }
  });

  it("recibo nasce 'administrative' mesmo se outro valor for enviado", async () => {
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ sensitivity: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Recibo teste', 'recibo', 'clinical') returning sensitivity`,
        [organizationId, patientId],
      );
      expect(rows[0].sensitivity).toBe("administrative");
    } finally {
      await session.close();
    }
  });

  it("tcle/contrato/declaracao/branco/outro exigem sensitivity explícita", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Contrato sem classificação', 'contrato', null)`,
        [organizationId, patientId],
      );
      expect(error).toMatch(/not-null|sensitivity must be chosen/i);

      const rows = await session.query<{ sensitivity: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Contrato administrativo', 'contrato', 'administrative') returning sensitivity`,
        [organizationId, patientId],
      );
      expect(rows[0].sensitivity).toBe("administrative");
    } finally {
      await session.close();
    }
  });

  it("sensitivity é imutável após a criação — nem admin consegue reclassificar", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [doc] = await session.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Declaração', 'declaracao', 'administrative') returning id`,
        [organizationId, patientId],
      );
      const updated = await session.query<{ sensitivity: string }>(
        `update public.documents set sensitivity = 'clinical' where id = $1 returning sensitivity`,
        [doc.id],
      );
      expect(updated[0].sensitivity).toBe("administrative");
    } finally {
      await session.close();
    }
  });

  it("secretária só vê/edita documentos administrative; nunca clinical", async () => {
    const adminSession = await openSession({ userId: admin });
    let clinicalDocId: string;
    let administrativeDocId: string;
    try {
      const clinical = await adminSession.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Laudo confidencial', 'laudo', 'clinical') returning id`,
        [organizationId, patientId],
      );
      clinicalDocId = clinical[0].id;
      const administrative = await adminSession.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Recibo aberto', 'recibo', 'administrative') returning id`,
        [organizationId, patientId],
      );
      administrativeDocId = administrative[0].id;
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const clinicalRows = await secretarySession.query(
        "select id from public.documents where id = $1",
        [clinicalDocId],
      );
      expect(clinicalRows).toEqual([]);

      const administrativeRows = await secretarySession.query(
        "select id from public.documents where id = $1",
        [administrativeDocId],
      );
      expect(administrativeRows).toHaveLength(1);

      const forbiddenInsert = await secretarySession.expectError(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Laudo forjado', 'laudo', 'administrative')`,
        [organizationId, patientId],
      );
      expect(forbiddenInsert).toMatch(/violates row-level security/i);

      const allowedInsert = await secretarySession.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Recibo pela secretária', 'recibo', 'administrative') returning id`,
        [organizationId, patientId],
      );
      expect(allowedInsert).toHaveLength(1);
    } finally {
      await secretarySession.close();
    }
  });

  it("ninguém de outra organização lê o documento, mesmo com o UUID", async () => {
    const session = await openSession({ userId: admin });
    let documentId: string;
    try {
      const [doc] = await session.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Recibo isolado', 'recibo', 'administrative') returning id`,
        [organizationId, patientId],
      );
      documentId = doc.id;
    } finally {
      await session.close();
    }

    const outsider = await createAuthUser();
    await bootstrapOrganization(outsider, "Consultório Isolado Documentos");
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const rows = await outsiderSession.query(
        "select id from public.documents where id = $1",
        [documentId],
      );
      expect(rows).toEqual([]);
    } finally {
      await outsiderSession.close();
    }
  });

  it("secretária não cria modelos; admin cria e a secretária só lê os administrativos", async () => {
    const adminSession = await openSession({ userId: admin });
    let administrativeTemplateId: string;
    let clinicalTemplateId: string;
    try {
      const [administrative] = await adminSession.query<{ id: string }>(
        `insert into public.document_templates
           (organization_id, name, document_kind, default_sensitivity, body_template)
         values ($1, 'Recibo padrão', 'recibo', 'administrative', 'Recibo de {{patient.full_name}}')
         returning id`,
        [organizationId],
      );
      administrativeTemplateId = administrative.id;
      const [clinical] = await adminSession.query<{ id: string }>(
        `insert into public.document_templates
           (organization_id, name, document_kind, default_sensitivity, body_template)
         values ($1, 'Laudo padrão', 'laudo', 'clinical', 'Laudo de {{patient.full_name}}')
         returning id`,
        [organizationId],
      );
      clinicalTemplateId = clinical.id;
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const administrative = await secretarySession.query(
        "select id from public.document_templates where id = $1",
        [administrativeTemplateId],
      );
      expect(administrative).toHaveLength(1);

      const clinical = await secretarySession.query(
        "select id from public.document_templates where id = $1",
        [clinicalTemplateId],
      );
      expect(clinical).toEqual([]);

      const forbidden = await secretarySession.expectError(
        `insert into public.document_templates
           (organization_id, name, document_kind, default_sensitivity, body_template)
         values ($1, 'forjado', 'recibo', 'administrative', '')`,
        [organizationId],
      );
      expect(forbidden).toMatch(/violates row-level security/i);
    } finally {
      await secretarySession.close();
    }
  });

  it("ninguém apaga um documento — só cancela", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [doc] = await session.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Recibo imutável', 'recibo', 'administrative') returning id`,
        [organizationId, patientId],
      );
      const error = await session.expectError("delete from public.documents where id = $1", [
        doc.id,
      ]);
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });
});

describe("document_versions / document_files — append-only e visibilidade por sensitivity", () => {
  let admin: string;
  let secretary: string;
  let organizationId: string;
  let patientId: string;
  let clinicalDocId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Consultório Versões");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId);

    const session = await openSession({ userId: admin });
    try {
      const [doc] = await session.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, $2, 'Laudo com versões', 'laudo', 'administrative') returning id`,
        [organizationId, patientId],
      );
      clinicalDocId = doc.id;
    } finally {
      await session.close();
    }
  });

  it("admin cria versão e arquivo gerado; ninguém edita versão já criada", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [version] = await session.query<{ id: string }>(
        `insert into public.document_versions (document_id, organization_id, version, body_snapshot)
         values ($1, $2, 1, 'Corpo do laudo.') returning id`,
        [clinicalDocId, organizationId],
      );

      const files = await session.query<{ id: string }>(
        `insert into public.document_files (document_id, document_version_id, organization_id, storage_path, byte_size, sha256)
         values ($1, $2, $3, $4, 1024, 'sha-teste') returning id`,
        [clinicalDocId, version.id, organizationId, `${organizationId}/${clinicalDocId}/v1.pdf`],
      );
      expect(files).toHaveLength(1);

      const error = await session.expectError(
        "update public.document_versions set body_snapshot = 'hackeado' where id = $1",
        [version.id],
      );
      expect(error).toMatch(/permission denied/i);
    } finally {
      await session.close();
    }
  });

  it("secretária não vê versões/arquivos de documento com sensitivity clinical na verdade — mas laudo é clinical, então nada aparece", async () => {
    // clinicalDocId's document_kind='laudo' forces sensitivity='clinical'
    // regardless of what was passed at insert time — this test proves the
    // secretary sees none of its versions/files.
    const session = await openSession({ userId: secretary });
    try {
      const versions = await session.query(
        "select id from public.document_versions where document_id = $1",
        [clinicalDocId],
      );
      expect(versions).toEqual([]);

      const files = await session.query(
        "select id from public.document_files where document_id = $1",
        [clinicalDocId],
      );
      expect(files).toEqual([]);
    } finally {
      await session.close();
    }
  });
});

describe("patient_attachments — sensibilidade e isolamento de tenant", () => {
  it("secretária lê/escreve só administrative; admin lê tudo; ninguém de outra org acessa", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Anexos");
    await addMember(admin, organizationId, secretary, "secretary");
    const patientId = await createPatient(admin, organizationId);

    const adminSession = await openSession({ userId: admin });
    let clinicalAttachmentId: string;
    try {
      const clinical = await adminSession.query<{ id: string }>(
        `insert into public.patient_attachments
           (organization_id, patient_id, sensitivity, title, storage_path, mime_type, byte_size, sha256)
         values ($1, $2, 'clinical', 'Anamnese', $3, 'application/pdf', 100, 'sha-a') returning id`,
        [organizationId, patientId, `${organizationId}/${patientId}/anamnese.pdf`],
      );
      clinicalAttachmentId = clinical[0].id;
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const clinicalRead = await secretarySession.query(
        "select id from public.patient_attachments where id = $1",
        [clinicalAttachmentId],
      );
      expect(clinicalRead).toEqual([]);

      const forbidden = await secretarySession.expectError(
        `insert into public.patient_attachments
           (organization_id, patient_id, sensitivity, title, storage_path, mime_type, byte_size, sha256)
         values ($1, $2, 'clinical', 'forjado', $3, 'application/pdf', 1, 'sha-b')`,
        [organizationId, patientId, `${organizationId}/${patientId}/forjado.pdf`],
      );
      expect(forbidden).toMatch(/violates row-level security/i);

      const allowed = await secretarySession.query<{ id: string }>(
        `insert into public.patient_attachments
           (organization_id, patient_id, sensitivity, title, storage_path, mime_type, byte_size, sha256)
         values ($1, $2, 'administrative', 'Comprovante', $3, 'application/pdf', 1, 'sha-c') returning id`,
        [organizationId, patientId, `${organizationId}/${patientId}/comprovante.pdf`],
      );
      expect(allowed).toHaveLength(1);
    } finally {
      await secretarySession.close();
    }

    const outsider = await createAuthUser();
    await bootstrapOrganization(outsider, "Consultório Isolado Anexos");
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const rows = await outsiderSession.query(
        "select id from public.patient_attachments where id = $1",
        [clinicalAttachmentId],
      );
      expect(rows).toEqual([]);
    } finally {
      await outsiderSession.close();
    }
  });
});

describe("consent_files — espelha a visibilidade administrative/clinical do consents", () => {
  it("secretária só vê arquivo de consentimento administrativo (service_terms/whatsapp)", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório TCLE Files");
    await addMember(admin, organizationId, secretary, "secretary");
    const patientId = await createPatient(admin, organizationId);

    const adminSession = await openSession({ userId: admin });
    let administrativeFileId: string;
    let clinicalFileId: string;
    let psychotherapyConsentId: string;
    try {
      const [serviceTermsConsent] = await adminSession.query<{ id: string }>(
        `insert into public.consents (organization_id, patient_id, type, title, version, status)
         values ($1, $2, 'service_terms', 'Termos de Serviço', 'v1', 'accepted') returning id`,
        [organizationId, patientId],
      );
      const administrativeFile = await adminSession.query<{ id: string }>(
        `insert into public.consent_files (consent_id, organization_id, version, storage_path, sha256)
         values ($1, $2, 'v1', $3, 'sha-terms') returning id`,
        [serviceTermsConsent.id, organizationId, `${organizationId}/${serviceTermsConsent.id}/v1.pdf`],
      );
      administrativeFileId = administrativeFile[0].id;

      const [psychotherapyConsent] = await adminSession.query<{ id: string }>(
        `insert into public.consents (organization_id, patient_id, type, title, version, status)
         values ($1, $2, 'psychotherapy', 'TCLE Psicoterapia', 'v1', 'accepted') returning id`,
        [organizationId, patientId],
      );
      psychotherapyConsentId = psychotherapyConsent.id;
      const clinicalFile = await adminSession.query<{ id: string }>(
        `insert into public.consent_files (consent_id, organization_id, version, storage_path, sha256)
         values ($1, $2, 'v1', $3, 'sha-tcle') returning id`,
        [psychotherapyConsent.id, organizationId, `${organizationId}/${psychotherapyConsent.id}/v1.pdf`],
      );
      clinicalFileId = clinicalFile[0].id;
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const administrativeRead = await secretarySession.query(
        "select id from public.consent_files where id = $1",
        [administrativeFileId],
      );
      expect(administrativeRead).toHaveLength(1);

      const clinicalRead = await secretarySession.query(
        "select id from public.consent_files where id = $1",
        [clinicalFileId],
      );
      expect(clinicalRead).toEqual([]);

      const forbiddenInsert = await secretarySession.expectError(
        `insert into public.consent_files (consent_id, organization_id, version, storage_path, sha256)
         values ($1, $2, 'v2', $3, 'sha-forjado')`,
        [psychotherapyConsentId, organizationId, `${organizationId}/forjado.pdf`],
      );
      expect(forbiddenInsert).toMatch(/violates row-level security/i);
    } finally {
      await secretarySession.close();
    }
  });
});

describe("Storage buckets — clinical-documents/patient-attachments/consents sem GRANT genérico", () => {
  it("nenhuma policy de RLS autoriza INSERT direto — só o service-role bypassa", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Buckets Docs");
    const session = await openSession({ userId: admin });
    try {
      for (const bucket of ["clinical-documents", "patient-attachments", "consents"]) {
        const buckets = await session.query<{ id: string; public: boolean }>(
          "select id, public from storage.buckets where id = $1",
          [bucket],
        );
        expect(buckets[0]?.public).toBe(false);
        const error = await session.expectError(
          `insert into storage.objects (bucket_id, name) values ($1, $2)`,
          [bucket, `${organizationId}/forged.pdf`],
        );
        expect(error).toMatch(/violates row-level security/i);
      }
    } finally {
      await session.close();
    }
  });
});

describe("Document Studio — kinds novos, parecer sem paciente, branding e isolamento da secretaria", () => {
  let admin: string;
  let secretary: string;
  let outsider: string;
  let organizationId: string;
  let patientId: string;

  beforeAll(async () => {
    admin = await createAuthUser();
    secretary = await createAuthUser();
    outsider = await createAuthUser();
    organizationId = await bootstrapOrganization(admin, "Estúdio Documentos");
    await bootstrapOrganization(outsider, "Outra Clínica");
    await addMember(admin, organizationId, secretary, "secretary");
    patientId = await createPatient(admin, organizationId);
  });

  it("status reviewed e delivered são aceitos no enum", async () => {
    const adminSession = await openSession({ userId: admin });
    let parecerId: string;
    try {
      const [row] = await adminSession.query<{ id: string; sensitivity: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
         values ($1, null, 'Parecer sem paciente', 'parecer', 'administrative')
         returning id, sensitivity`,
        [organizationId],
      );
      expect(row.sensitivity).toBe("clinical");
      parecerId = row.id;
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const rows = await secretarySession.query(
        "select id from public.documents where id = $1",
        [parecerId],
      );
      expect(rows).toEqual([]);
    } finally {
      await secretarySession.close();
    }
  });

  it("autorizacao/requerimento/protocolo nascem administrativos", async () => {
    const session = await openSession({ userId: admin });
    try {
      for (const kind of ["autorizacao", "requerimento", "protocolo"]) {
        const rows = await session.query<{ sensitivity: string }>(
          `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity)
           values ($1, $2, $3, $4, 'clinical') returning sensitivity`,
          [organizationId, patientId, `Doc ${kind}`, kind],
        );
        expect(rows[0].sensitivity).toBe("administrative");
      }
    } finally {
      await session.close();
    }
  });

  it("secretária lê branding da organização, mas não grava logos nem identidade", async () => {
    const adminSession = await openSession({ userId: admin });
    try {
      await adminSession.query(
        `insert into public.document_branding (organization_id, clinic_name)
         values ($1, 'Marca da clínica')
         on conflict (organization_id) do update set clinic_name = excluded.clinic_name`,
        [organizationId],
      );
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const visible = await secretarySession.query<{ clinic_name: string }>(
        "select clinic_name from public.document_branding where organization_id = $1",
        [organizationId],
      );
      expect(visible[0]?.clinic_name).toBe("Marca da clínica");

      const insertLogo = await secretarySession.expectError(
        `insert into public.document_logos
           (organization_id, variant, label, storage_path, mime_type, byte_size, sha256)
         values ($1, 'principal', 'x', $2, 'image/png', 12, 'abcd')`,
        [organizationId, `${organizationId}/logos/x.png`],
      );
      expect(insertLogo).toMatch(/row-level security/i);

      const updated = await secretarySession.query(
        `update public.document_branding set clinic_name = 'Forjada' where organization_id = $1 returning clinic_name`,
        [organizationId],
      );
      expect(updated).toEqual([]);
    } finally {
      await secretarySession.close();
    }
  });

  it("tenant externo não lê branding nem documentos", async () => {
    const outsiderSession = await openSession({ userId: outsider });
    try {
      const branding = await outsiderSession.query(
        "select clinic_name from public.document_branding where organization_id = $1",
        [organizationId],
      );
      expect(branding).toEqual([]);
      const docs = await outsiderSession.query(
        "select id from public.documents where organization_id = $1",
        [organizationId],
      );
      expect(docs).toEqual([]);
    } finally {
      await outsiderSession.close();
    }
  });

  it("secretária não registra entrega de documento clínico", async () => {
    const adminSession = await openSession({ userId: admin });
    let clinicalId: string;
    try {
      const [doc] = await adminSession.query<{ id: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity, status, issued_at)
         values ($1, $2, 'Relatório emitido', 'relatorio', 'clinical', 'issued', now())
         returning id`,
        [organizationId, patientId],
      );
      clinicalId = doc.id;
    } finally {
      await adminSession.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const error = await secretarySession.expectError(
        `insert into public.document_delivery
           (organization_id, document_id, recipient_name, delivered_at, method)
         values ($1, $2, 'Destinatário', now(), 'presencial')`,
        [organizationId, clinicalId],
      );
      expect(error).toMatch(/row-level security|not authorized/i);
    } finally {
      await secretarySession.close();
    }
  });

  it("bucket document-branding existe, é privado, e storage.objects não tem policy aberta", async () => {
    const session = await openSession({ userId: admin });
    try {
      const buckets = await session.query<{ id: string; public: boolean }>(
        "select id, public from storage.buckets where id = 'document-branding'",
      );
      expect(buckets).toHaveLength(1);
      expect(buckets[0].public).toBe(false);
      const insertError = await session.expectError(
        `insert into storage.objects (bucket_id, name, owner)
         values ('document-branding', $1, $2)`,
        [`${organizationId}/logos/secret.png`, admin],
      );
      expect(insertError).toMatch(/row-level security/i);
      const selectRows = await session.query(
        `select id from storage.objects where bucket_id = 'document-branding'`,
      );
      expect(selectRows).toEqual([]);
    } finally {
      await session.close();
    }
  });

  it("modelo de parecer/laudo não pode nascer administrative para a secretária ler o corpo", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [parecer] = await session.query<{ default_sensitivity: string }>(
        `insert into public.document_templates
           (organization_id, name, document_kind, default_sensitivity, body_template)
         values ($1, 'Parecer forjado', 'parecer', 'administrative', 'corpo clínico')
         returning default_sensitivity`,
        [organizationId],
      );
      expect(parecer.default_sensitivity).toBe("clinical");
    } finally {
      await session.close();
    }

    const secretarySession = await openSession({ userId: secretary });
    try {
      const rows = await secretarySession.query(
        `select id from public.document_templates
         where organization_id = $1 and document_kind = 'parecer'`,
        [organizationId],
      );
      expect(rows).toEqual([]);
    } finally {
      await secretarySession.close();
    }
  });

  it("logo print_storage_path de outro tenant é rejeitado", async () => {
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.document_logos
           (organization_id, variant, label, storage_path, print_storage_path, mime_type, byte_size, sha256)
         values ($1, 'principal', 'x', $2, $3, 'image/png', 12, 'abcd')`,
        [organizationId, `${organizationId}/logos/ok.png`, "outra-org/logos/stolen.png"],
      );
      expect(error).toMatch(/org-prefixed|23514/i);
    } finally {
      await session.close();
    }
  });

  it("status reviewed e delivered são aceitos no enum", async () => {
    const session = await openSession({ userId: admin });
    try {
      const [doc] = await session.query<{ status: string }>(
        `insert into public.documents (organization_id, patient_id, title, document_kind, sensitivity, status)
         values ($1, $2, 'Em revisão', 'declaracao', 'clinical', 'under_review')
         returning status`,
        [organizationId, patientId],
      );
      expect(doc.status).toBe("under_review");
    } finally {
      await session.close();
    }
  });
});
