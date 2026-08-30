"use server";

import { revalidatePath } from "next/cache";
import {
  FORCED_ADMINISTRATIVE_KINDS,
  FORCED_CLINICAL_KINDS,
  createDocumentSchema,
  createTemplateSchema,
  registerAttachmentSchema,
  saveDraftSchema,
  signDocumentSchema,
  type DocumentKind,
  type DocumentSensitivity,
} from "@/features/documents/contracts";
import { buildDocumentVariables } from "@/features/documents/variables";
import { hasUnresolvedPlaceholders, renderTemplate } from "@/lib/documents/render-template";
import { generateDocumentPdf } from "@/lib/documents/generate-pdf";
import {
  DOCUMENT_BUCKETS,
  buildStoragePath,
  createSignedDownloadUrl,
  createSignedUploadUrl,
  removeFile,
  sha256Hex,
  uploadGeneratedFile,
} from "@/lib/documents/storage";
import { canAccessPatientClinical, isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDocument, getLatestVersion, getFileForVersion } from "@/features/documents/queries";
import { getPatient } from "@/features/patients/queries";

export interface DocumentActionResult {
  error?: string;
  id?: string;
  url?: string;
}

function forcedSensitivity(documentKind: DocumentKind): DocumentSensitivity | null {
  if (FORCED_CLINICAL_KINDS.includes(documentKind)) return "clinical";
  if (FORCED_ADMINISTRATIVE_KINDS.includes(documentKind)) return "administrative";
  return null;
}

export async function createTemplateAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora gerencia modelos." };
  }
  const parsed = createTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_templates")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      document_kind: parsed.data.documentKind,
      default_sensitivity: parsed.data.defaultSensitivity,
      body_template: parsed.data.bodyTemplate,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: "Não foi possível criar o modelo agora." };
  }
  revalidatePath("/app/documents");
  return { id: data.id };
}

export async function createDocumentAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role, user } = await requireOrgContext();
  const parsed = createDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const forced = forcedSensitivity(parsed.data.documentKind);
  const sensitivity = forced ?? parsed.data.sensitivity;
  if (!sensitivity) {
    return { error: "Escolha a classificação (administrativo ou clínico) para este tipo." };
  }
  if (!isClinicalPractitioner(role) && sensitivity !== "administrative") {
    return { error: "A secretaria só cria documentos administrativos." };
  }
  if (parsed.data.patientId) {
    const patient = await getPatient(organizationId, parsed.data.patientId);
    if (!patient) {
      return { error: "Paciente não encontrado." };
    }
    if (
      sensitivity === "clinical" &&
      !canAccessPatientClinical({
        role,
        userId: user.id,
        responsiblePsychologistUserId: patient.responsible_psychologist_user_id,
      })
    ) {
      return { error: "Somente a psicóloga responsável cria documentos clínicos deste paciente." };
    }
  }

  const variables = await buildDocumentVariables(organizationId, parsed.data.patientId);
  const renderedBody = renderTemplate(parsed.data.body, variables);

  const supabase = await createSupabaseServerClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      organization_id: organizationId,
      patient_id: parsed.data.patientId || null,
      template_id: parsed.data.templateId || null,
      title: parsed.data.title,
      document_kind: parsed.data.documentKind,
      sensitivity,
    })
    .select("id")
    .single();
  if (documentError || !document) {
    return { error: "Não foi possível criar o documento agora." };
  }

  const { error: versionError } = await supabase.from("document_versions").insert({
    document_id: document.id,
    organization_id: organizationId,
    version: 1,
    body_snapshot: renderedBody,
    variables_snapshot: variables,
  });
  if (versionError) {
    return { error: "Documento criado, mas a primeira versão falhou." };
  }

  revalidatePath("/app/documents");
  if (parsed.data.patientId) {
    revalidatePath(`/app/patients/${parsed.data.patientId}`);
  }
  return { id: document.id };
}

export async function saveDraftAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) {
    return { error: "Documento não encontrado." };
  }
  if (document.status !== "draft") {
    return { error: "Só é possível editar um documento em rascunho." };
  }

  const previous = await getLatestVersion(document.id);
  const nextVersion = (previous?.version ?? 0) + 1;
  const variables = await buildDocumentVariables(organizationId, document.patient_id);
  const renderedBody = renderTemplate(parsed.data.body, variables);

  const supabase = await createSupabaseServerClient();
  const { error: versionError } = await supabase.from("document_versions").insert({
    document_id: document.id,
    organization_id: organizationId,
    version: nextVersion,
    body_snapshot: renderedBody,
    variables_snapshot: variables,
  });
  if (versionError) {
    return { error: "Não foi possível salvar o rascunho agora." };
  }

  await supabase
    .from("documents")
    .update({ current_version: nextVersion })
    .eq("id", document.id);

  revalidatePath(`/app/documents/${document.id}`);
  if (document.patient_id) {
    revalidatePath(`/app/patients/${document.patient_id}`);
  }
  return { id: document.id };
}

/**
 * Freezes the current draft version: generates the PDF, uploads it
 * directly (server already has the bytes — no signed URL detour needed),
 * and moves the document to 'issued'. Irreversible by design — a mistake
 * after this point means canceling and creating a new document, matching
 * how `sensitivity` immutability is handled.
 */
export async function issueDocumentAction(documentId: string): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const document = await getDocument(organizationId, documentId);
  if (!document) {
    return { error: "Documento não encontrado." };
  }
  if (document.status !== "draft") {
    return { error: "Este documento já foi emitido ou cancelado." };
  }

  const version = await getLatestVersion(documentId);
  if (!version) {
    return { error: "Nenhuma versão para emitir." };
  }
  if (hasUnresolvedPlaceholders(version.body_snapshot)) {
    return { error: "Há placeholders não resolvidos ({{variável}}). Complete-os antes de emitir." };
  }

  const pdfBytes = await generateDocumentPdf({
    title: document.title,
    body: version.body_snapshot,
    footer: `Documento gerado eletronicamente pelo VirgíniaPsi em ${new Date().toLocaleString("pt-BR")}.`,
  });
  const storagePath = buildStoragePath(organizationId, documentId, `${documentId}-v${version.version}.pdf`);

  try {
    await uploadGeneratedFile(
      DOCUMENT_BUCKETS.clinicalDocuments,
      storagePath,
      pdfBytes,
      "application/pdf",
    );
  } catch {
    return { error: "Não foi possível gerar o arquivo do documento agora." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: fileError } = await supabase.from("document_files").insert({
    document_id: documentId,
    document_version_id: version.id,
    organization_id: organizationId,
    storage_path: storagePath,
    byte_size: pdfBytes.byteLength,
    sha256: sha256Hex(pdfBytes),
  });
  if (fileError) {
    await removeFile(DOCUMENT_BUCKETS.clinicalDocuments, storagePath);
    return { error: "Não foi possível registrar o arquivo gerado." };
  }

  const { error: updateError } = await supabase
    .from("documents")
    .update({ status: "issued", issued_at: new Date().toISOString() })
    .eq("id", documentId);
  if (updateError) {
    return { error: "Arquivo gerado, mas não foi possível marcar o documento como emitido." };
  }

  await logAuditEvent({
    organizationId,
    action: "document.issue",
    resourceType: "document",
    resourceId: documentId,
  });

  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app/documents");
  if (document.patient_id) {
    revalidatePath(`/app/patients/${document.patient_id}`);
  }
  return { id: documentId };
}

export async function cancelDocumentAction(documentId: string): Promise<DocumentActionResult> {
  const { organizationId, role } = await requireOrgContext();
  const document = await getDocument(organizationId, documentId);
  if (!document) {
    return { error: "Documento não encontrado." };
  }
  if (document.sensitivity !== "administrative" && !isClinicalPractitioner(role)) {
    return { error: "Somente a psicóloga responsável cancela este documento clínico." };
  }
  if (document.status === "canceled") {
    return { id: documentId };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("documents")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("organization_id", organizationId);
  if (error) {
    return { error: "Não foi possível cancelar o documento agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "document.cancel",
    resourceType: "document",
    resourceId: documentId,
  });

  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app/documents");
  if (document.patient_id) {
    revalidatePath(`/app/patients/${document.patient_id}`);
  }
  return { id: documentId };
}

export async function requestDocumentDownloadUrlAction(
  documentVersionId: string,
): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const file = await getFileForVersion(documentVersionId);
  if (!file) {
    return { error: "Arquivo não encontrado." };
  }
  // getFileForVersion() already runs under the caller's own RLS (which
  // enforces sensitivity+role), so reaching this point already proves
  // authorization — same trust boundary as getPatient() elsewhere.
  const document = await getDocument(organizationId, file.document_id);
  if (!document) {
    return { error: "Documento não encontrado." };
  }

  try {
    const url = await createSignedDownloadUrl(DOCUMENT_BUCKETS.clinicalDocuments, file.storage_path);
    return { url };
  } catch {
    return { error: "Não foi possível gerar o link de download agora." };
  }
}

// -------------------------------------------------------- Attachments ---

export async function requestAttachmentUploadUrlAction(input: {
  patientId: string;
  sensitivity: "administrative" | "clinical";
  filename: string;
}): Promise<DocumentActionResult & { path?: string; token?: string }> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role) && input.sensitivity !== "administrative") {
    return { error: "A secretaria só envia anexos administrativos." };
  }
  const patient = await getPatient(organizationId, input.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }

  const path = buildStoragePath(organizationId, input.patientId, input.filename);
  try {
    const { token } = await createSignedUploadUrl(DOCUMENT_BUCKETS.patientAttachments, path);
    return { path, token };
  } catch {
    return { error: "Não foi possível preparar o envio agora." };
  }
}

export async function registerAttachmentAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role } = await requireOrgContext();
  const parsed = registerAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (!isClinicalPractitioner(role) && parsed.data.sensitivity !== "administrative") {
    return { error: "A secretaria só registra anexos administrativos." };
  }
  const patient = await getPatient(organizationId, parsed.data.patientId);
  if (!patient) {
    return { error: "Paciente não encontrado." };
  }
  if (!parsed.data.storagePath.startsWith(`${organizationId}/`)) {
    return { error: "Caminho de upload inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patient_attachments")
    .insert({
      organization_id: organizationId,
      patient_id: parsed.data.patientId,
      sensitivity: parsed.data.sensitivity,
      title: parsed.data.title,
      storage_path: parsed.data.storagePath,
      mime_type: parsed.data.mimeType,
      byte_size: parsed.data.byteSize,
      sha256: parsed.data.sha256,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: "Não foi possível registrar o anexo agora." };
  }

  revalidatePath(`/app/patients/${parsed.data.patientId}`);
  return { id: data.id };
}

export async function deleteAttachmentAction(attachmentId: string): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const { data: attachment } = await supabase
    .from("patient_attachments")
    .select("storage_path, patient_id")
    .eq("id", attachmentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const { error } = await supabase
    .from("patient_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("organization_id", organizationId);
  if (error || !attachment) {
    return { error: "Não foi possível remover o anexo agora." };
  }

  await removeFile(DOCUMENT_BUCKETS.patientAttachments, attachment.storage_path);
  revalidatePath(`/app/patients/${attachment.patient_id}`);
  return { id: attachmentId };
}

export async function requestAttachmentDownloadUrlAction(
  attachmentId: string,
): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const { data: attachment } = await supabase
    .from("patient_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!attachment) {
    return { error: "Anexo não encontrado." };
  }

  try {
    const url = await createSignedDownloadUrl(
      DOCUMENT_BUCKETS.patientAttachments,
      attachment.storage_path,
    );
    return { url };
  } catch {
    return { error: "Não foi possível gerar o link de download agora." };
  }
}

export async function signDocumentAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: "Somente a profissional responsável registra a confirmação eletrônica." };
  }
  const parsed = signDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) {
    return { error: "Documento não encontrado." };
  }
  if (document.status !== "issued" && document.status !== "signature_pending") {
    return { error: "Só é possível confirmar um documento já emitido." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("documents")
    .update({ status: "signed" })
    .eq("id", document.id)
    .eq("organization_id", organizationId);
  if (error) {
    return { error: "Não foi possível registrar a confirmação agora." };
  }
  await logAuditEvent({
    organizationId,
    action: "document_signature_registered",
    resourceType: "document",
    resourceId: document.id,
    metadata: { method: "virginiapsi_internal" },
  });
  revalidatePath(`/app/documents/${document.id}`);
  return { id: document.id };
}

