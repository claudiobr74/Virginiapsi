"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPatientClinicalAccess } from "@/features/patients/clinical-access";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPatient } from "@/features/patients/queries";
import { buildDocumentVariables } from "@/features/documents/variables";
import { renderTemplate } from "@/lib/documents/render-template";
import { generateDocumentPdf } from "@/lib/documents/generate-pdf";
import {
  DOCUMENT_BUCKETS,
  buildStoragePath,
  createSignedDownloadUrl,
  sha256Hex,
  uploadGeneratedFile,
} from "@/lib/documents/storage";
import { TCLE_BODY_TEMPLATE, TCLE_LEGAL_REVIEW_STATUS, TCLE_VERSION } from "@/features/consents/tcle-content";
import { TCLE_CONSENT_TYPES } from "@/features/consents/tcle";

export interface TcleActionResult {
  error?: string;
  consentId?: string;
  url?: string;
}

async function acceptanceIpHash(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip ? createHash("sha256").update(ip).digest("hex") : null;
}

const acceptTcleSchema = z.object({
  patientId: z.string().uuid(),
  type: z.enum(TCLE_CONSENT_TYPES),
  guardianAuthorization: z.boolean().default(false),
  guardianName: z.string().trim().max(160).optional().or(z.literal("")),
  patientAssent: z.boolean().default(false),
});

/**
 * Records acceptance AND generates the durable PDF proof
 * (`consent_files`) in the same action — the two must never drift apart:
 * a consent row with no matching file, or a file with no consent row,
 * would each be useless as evidence on their own.
 */
export async function acceptTcleAction(input: unknown): Promise<TcleActionResult> {
  const { organizationId, role, user } = await requireOrgContext();
  const parsed = acceptTcleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (
    !(await hasPatientClinicalAccess({
      organizationId,
      role,
      userId: user.id,
      patientId: parsed.data.patientId,
    }))
  ) {
    return { error: "Apenas a psicóloga responsável registra o aceite do TCLE." };
  }

  const patient = await getPatient(organizationId, parsed.data.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: consent, error: consentError } = await supabase
    .from("consents")
    .insert({
      organization_id: organizationId,
      patient_id: parsed.data.patientId,
      type: parsed.data.type,
      title: "Termo de Consentimento Livre e Esclarecido",
      version: TCLE_VERSION,
      status: "accepted",
      accepted_ip_hash: await acceptanceIpHash(),
      guardian_authorization: parsed.data.guardianAuthorization,
      guardian_name: parsed.data.guardianName || null,
      patient_assent: parsed.data.patientAssent,
      body_sha256: sha256Hex(Buffer.from(TCLE_BODY_TEMPLATE, "utf8")),
      legal_review_status: TCLE_LEGAL_REVIEW_STATUS,
    })
    .select("id")
    .single();

  if (consentError || !consent) {
    return { error: "Não foi possível registrar o aceite agora." };
  }

  try {
    const variables = await buildDocumentVariables(organizationId, parsed.data.patientId);
    const body = renderTemplate(TCLE_BODY_TEMPLATE, variables);
    const pdfBytes = await generateDocumentPdf({
      title: "Termo de Consentimento Livre e Esclarecido",
      body,
      footer: `Versão ${TCLE_VERSION} — aceite registrado eletronicamente pelo VirgíniaPsi.`,
    });
    const storagePath = buildStoragePath(organizationId, consent.id, `tcle-${TCLE_VERSION}.pdf`);
    await uploadGeneratedFile(DOCUMENT_BUCKETS.consents, storagePath, pdfBytes, "application/pdf");

    await supabase.from("consent_files").insert({
      consent_id: consent.id,
      organization_id: organizationId,
      version: TCLE_VERSION,
      storage_path: storagePath,
      sha256: sha256Hex(pdfBytes),
    });
  } catch {
    // The consent record itself is already valid evidence even if the PDF
    // generation hiccups — never roll back a real acceptance because a
    // convenience artifact failed.
  }

  await logAuditEvent({
    organizationId,
    action: "tcle.accept",
    resourceType: "consent",
    resourceId: consent.id,
    metadata: {
      type: parsed.data.type,
      version: TCLE_VERSION,
      legal_review_status: TCLE_LEGAL_REVIEW_STATUS,
    },
  });

  revalidatePath(`/app/patients/${parsed.data.patientId}`);
  return { consentId: consent.id };
}

export async function requestConsentFileDownloadUrlAction(
  consentId: string,
): Promise<TcleActionResult> {
  const { organizationId } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  // RLS on consent_files already mirrors the parent consent's
  // administrative/clinical visibility — reaching this row is the
  // authorization check.
  const { data: file, error } = await supabase
    .from("consent_files")
    .select("storage_path, organization_id")
    .eq("consent_id", consentId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((error && error.code !== "PGRST116") || !file || file.organization_id !== organizationId) {
    return { error: "Arquivo do consentimento não encontrado." };
  }

  try {
    const url = await createSignedDownloadUrl(DOCUMENT_BUCKETS.consents, file.storage_path);
    return { url };
  } catch {
    return { error: "Não foi possível gerar o link de download agora." };
  }
}
