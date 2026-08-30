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

describe("assinatura profissional interna", () => {
  async function seedIssuedDocument(
    actorUserId: string,
    organizationId: string,
    patientId: string,
    pdfHash: string,
  ): Promise<{ documentId: string; versionId: string; fileId: string }> {
    const session = await openSession({ userId: actorUserId });
    try {
      const [document] = await session.query<{ id: string }>(
        `insert into public.documents
           (organization_id, patient_id, title, document_kind, sensitivity, status, issued_at)
         values ($1, $2, 'Declaração interna', 'declaracao', 'administrative', 'issued', now())
         returning id`,
        [organizationId, patientId],
      );
      const [version] = await session.query<{ id: string }>(
        `insert into public.document_versions
           (document_id, organization_id, version, body_snapshot, variables_snapshot)
         values ($1, $2, 1, 'Corpo', '{}'::jsonb)
         returning id`,
        [document.id, organizationId],
      );
      const [file] = await session.query<{ id: string }>(
        `insert into public.document_files
           (document_id, document_version_id, organization_id, storage_path, byte_size, sha256)
         values ($1, $2, $3, $4, 12, $5)
         returning id`,
        [
          document.id,
          version.id,
          organizationId,
          `${organizationId}/${document.id}/${version.id}.pdf`,
          pdfHash,
        ],
      );
      return { documentId: document.id, versionId: version.id, fileId: file.id };
    } finally {
      await session.close();
    }
  }

  it("rejeita hash divergente do PDF armazenado", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Assinatura Hash");
    const patientId = await createPatient(admin, organizationId);
    const pdfHash = "a".repeat(64);
    const seeded = await seedIssuedDocument(admin, organizationId, patientId, pdfHash);
    const session = await openSession({ userId: admin });
    try {
      const error = await session.expectError(
        `insert into public.document_professional_signatures
           (organization_id, document_id, document_version_id, document_file_id,
            professional_user_id, professional_name, professional_registration,
            professional_registration_state, document_sha256, signature_method,
            confirmation_acknowledged)
         values ($1, $2, $3, $4, $5, 'Dra. Ana', 'CRP 06/00000', 'SP', $6,
                 'virginiapsi_internal', true)`,
        [
          organizationId,
          seeded.documentId,
          seeded.versionId,
          seeded.fileId,
          admin,
          "b".repeat(64),
        ],
      );
      expect(error).toMatch(/hash must match|signature hash/i);
    } finally {
      await session.close();
    }
  });

  it("secretária não insere assinatura profissional", async () => {
    const admin = await createAuthUser();
    const secretary = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Assinatura Secretaria");
    await addMember(admin, organizationId, secretary, "secretary");
    const patientId = await createPatient(admin, organizationId);
    const pdfHash = "c".repeat(64);
    const seeded = await seedIssuedDocument(admin, organizationId, patientId, pdfHash);
    const session = await openSession({ userId: secretary });
    try {
      const error = await session.expectError(
        `insert into public.document_professional_signatures
           (organization_id, document_id, document_version_id, document_file_id,
            professional_user_id, professional_name, professional_registration,
            professional_registration_state, document_sha256, signature_method,
            confirmation_acknowledged)
         values ($1, $2, $3, $4, $5, 'Dra. Ana', 'CRP 06/00000', 'SP', $6,
                 'virginiapsi_internal', true)`,
        [
          organizationId,
          seeded.documentId,
          seeded.versionId,
          seeded.fileId,
          admin,
          pdfHash,
        ],
      );
      expect(error).toMatch(/row-level security|violates/i);
    } finally {
      await session.close();
    }
  });

  it("profissional confirma emissão com hash idêntico ao PDF", async () => {
    const admin = await createAuthUser();
    const organizationId = await bootstrapOrganization(admin, "Consultório Assinatura Ok");
    const patientId = await createPatient(admin, organizationId);
    const pdfHash = "d".repeat(64);
    const seeded = await seedIssuedDocument(admin, organizationId, patientId, pdfHash);
    const session = await openSession({ userId: admin });
    try {
      const rows = await session.query<{ signature_method: string; document_sha256: string }>(
        `insert into public.document_professional_signatures
           (organization_id, document_id, document_version_id, document_file_id,
            professional_user_id, professional_name, professional_registration,
            professional_registration_state, document_sha256, signature_method,
            confirmation_acknowledged)
         values ($1, $2, $3, $4, $5, 'Dra. Ana', 'CRP 06/00000', 'SP', $6,
                 'virginiapsi_internal', true)
         returning signature_method, document_sha256`,
        [
          organizationId,
          seeded.documentId,
          seeded.versionId,
          seeded.fileId,
          admin,
          pdfHash,
        ],
      );
      expect(rows[0].signature_method).toBe("virginiapsi_internal");
      expect(rows[0].document_sha256).toBe(pdfHash);

      const mutated = await session.expectError(
        `update public.document_professional_signatures
         set professional_name = 'Outro' where document_id = $1`,
        [seeded.documentId],
      );
      expect(mutated).toMatch(/permission denied|does not exist|read-only/i);
    } finally {
      await session.close();
    }
  });
});
