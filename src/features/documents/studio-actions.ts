"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  FORCED_ADMINISTRATIVE_KINDS,
  FORCED_CLINICAL_KINDS,
  createStudioDocumentSchema,
  duplicateDocumentSchema,
  issueStudioDocumentSchema,
  registerDeliverySchema,
  registerExternalSignatureSchema,
  reviewDocumentSchema,
  saveAsTemplateSchema,
  saveStudioDraftSchema,
  type DocumentKind,
  type DocumentSection,
  type DocumentSensitivity,
} from "@/features/documents/contracts";
import { getSystemTemplate } from "@/features/documents/system-templates";
import { sectionsToBody } from "@/features/documents/sections";
import { buildDocumentVariables } from "@/features/documents/variables";
import { renderTemplate, hasUnresolvedPlaceholders, withDocumentScopedVariables } from "@/lib/documents/render-template";
import { getDocumentBranding } from "@/features/documents/branding-queries";
import {
  cancelDocumentAction,
  issueDocumentAction as issueClassicDocumentAction,
  type DocumentActionResult,
} from "@/features/documents/actions";
import { renderDocumentStudioPdf } from "@/features/documents/render-studio-pdf";
import {
  DOCUMENT_BUCKETS,
  buildStoragePath,
  removeFile,
  sha256Hex,
  uploadGeneratedFile,
} from "@/lib/documents/storage";
import { canAccessPatientClinical, isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { logAuditEvent } from "@/lib/audit/log-audit-event";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDocument,
  getLatestVersion,
  listDocumentDeliveries as listDeliveries,
} from "@/features/documents/queries";
import { getPatient } from "@/features/patients/queries";
import { resolveConsentState } from "@/features/consents/queries";
import { getServerEnv } from "@/lib/env/server";
import { GeminiClient } from "@/lib/integrations/gemini/client";
import { geminiDocumentsModel } from "@/lib/ai/documents-model";
import { RUNTIME_PROMPTS } from "@/lib/ai/prompts";
import { AI_RATE_LIMIT_MESSAGE, consumeAiRateLimit } from "@/lib/security/rate-limit";
import { loadDocumentChartContext } from "@/features/documents/chart-import";
import type { DocumentChartImportSelection } from "@/features/documents/chart-import";

function forcedSensitivity(documentKind: DocumentKind): DocumentSensitivity | null {
  if (FORCED_CLINICAL_KINDS.includes(documentKind)) return "clinical";
  if (FORCED_ADMINISTRATIVE_KINDS.includes(documentKind)) return "administrative";
  return null;
}

function defaultSensitivity(kind: DocumentKind): DocumentSensitivity {
  const forced = forcedSensitivity(kind);
  if (forced) return forced;
  if (kind === "contrato" || kind === "tcle" || kind === "branco" || kind === "outro") {
    return "administrative";
  }
  return "clinical";
}

function contentHash(body: string, sections: DocumentSection[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ body, sections }))
    .digest("hex");
}

function renderSections(sections: DocumentSection[], variables: Record<string, string>): DocumentSection[] {
  return sections.map((section) => ({
    ...section,
    title: renderTemplate(section.title, variables),
    content: renderTemplate(section.content, variables),
  }));
}

export async function createStudioDocumentAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role, user } = await requireOrgContext();
  const parsed = createStudioDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const template = getSystemTemplate(parsed.data.templateKey);
  if (!template) {
    return { error: "Modelo profissional não encontrado." };
  }
  if (template.guardrails.requiresPatient && !parsed.data.patientId) {
    return { error: "Este modelo exige a seleção de um paciente." };
  }

  const sensitivity = defaultSensitivity(template.documentKind);
  if (!isClinicalPractitioner(role) && sensitivity !== "administrative") {
    return { error: "A secretaria só cria documentos administrativos." };
  }

  let guardianMinor = false;
  if (parsed.data.patientId) {
    const patient = await getPatient(organizationId, parsed.data.patientId);
    if (!patient) return { error: "Paciente não encontrado." };
    guardianMinor = (patient.responsibles?.length ?? 0) > 0;
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

  const branding = await getDocumentBranding(organizationId).catch(() => null);
  const variables = withDocumentScopedVariables(
    await buildDocumentVariables(organizationId, parsed.data.patientId),
    { purpose: parsed.data.purpose, recipientName: parsed.data.recipientName },
  );
  const sections = renderSections(
    template.buildSections({
      patientName: variables["patient.full_name"],
      preferredName: variables["patient.preferred_name"],
      professionalName: variables["professional.name"],
      organizationName: variables["organization.name"],
      today: variables["date.today"],
      purpose: parsed.data.purpose,
      recipientName: parsed.data.recipientName,
      cancellationNoticeHours: branding?.cancellation_notice_hours ?? 24,
      extra: {
        includeAiClause: branding?.include_ai_informative_clause ? "true" : "false",
        includesMinor: guardianMinor ? "true" : "false",
      },
    }),
    variables,
  );
  const body = sectionsToBody(sections);
  const title = parsed.data.title?.trim() || template.name;
  const layoutFormat =
    parsed.data.layoutFormat ??
    (template.supportsBooklet ? "livreto" : "tradicional");

  const supabase = await createSupabaseServerClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      organization_id: organizationId,
      patient_id: parsed.data.patientId || null,
      title,
      document_kind: template.documentKind,
      sensitivity,
      system_template_key: template.key,
      visual_profile: template.defaultVisualProfile,
      recipient_name: parsed.data.recipientName || null,
      purpose: parsed.data.purpose || null,
      structured_data: { templateVersion: template.version },
      drafting_mode: parsed.data.draftingMode ?? "manual",
      cover_enabled: Boolean(template.supportsCover && layoutFormat !== "livreto"),
      layout_format: layoutFormat,
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
    body_snapshot: body,
    variables_snapshot: variables,
    sections_snapshot: sections,
    content_sha256: contentHash(body, sections),
  });
  if (versionError) {
    return { error: "Documento criado, mas a primeira versão falhou." };
  }

  await logAuditEvent({
    organizationId,
    action: "document_created",
    resourceType: "document",
    resourceId: document.id,
    metadata: { template_key: template.key },
  });
  await logAuditEvent({
    organizationId,
    action: "document_template_used",
    resourceType: "document",
    resourceId: document.id,
    metadata: { template_key: template.key, template_version: template.version },
  });

  revalidatePath("/app/documents");
  if (parsed.data.patientId) {
    revalidatePath(`/app/patients/${parsed.data.patientId}`);
  }
  return { id: document.id };
}

export async function saveStudioDraftAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const parsed = saveStudioDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) return { error: "Documento não encontrado." };
  if (document.status !== "draft" && document.status !== "under_review") {
    return { error: "Só é possível editar um documento em rascunho." };
  }

  const previous = await getLatestVersion(document.id);
  const nextVersion = (previous?.version ?? 0) + 1;
  const variables = withDocumentScopedVariables(
    await buildDocumentVariables(organizationId, document.patient_id),
    {
      purpose: parsed.data.purpose ?? document.purpose,
      recipientName: parsed.data.recipientName ?? document.recipient_name,
    },
  );
  const renderedSections = renderSections(parsed.data.sections, variables);
  const body = parsed.data.body?.trim()
    ? renderTemplate(parsed.data.body, variables)
    : sectionsToBody(renderedSections);

  const supabase = await createSupabaseServerClient();
  const { error: versionError } = await supabase.from("document_versions").insert({
    document_id: document.id,
    organization_id: organizationId,
    version: nextVersion,
    body_snapshot: body,
    variables_snapshot: variables,
    sections_snapshot: renderedSections,
    content_sha256: contentHash(body, renderedSections),
  });
  if (versionError) {
    return { error: "Não foi possível salvar o rascunho agora." };
  }

  const patch: Record<string, unknown> = {
    current_version: nextVersion,
  };
  if (parsed.data.recipientName !== undefined) patch.recipient_name = parsed.data.recipientName;
  if (parsed.data.purpose !== undefined) patch.purpose = parsed.data.purpose;
  if (parsed.data.visualProfile) patch.visual_profile = parsed.data.visualProfile;
  if (parsed.data.logoMode) patch.logo_mode = parsed.data.logoMode;
  if (parsed.data.logoAlign) patch.logo_align = parsed.data.logoAlign;
  if (parsed.data.logoSize) patch.logo_size = parsed.data.logoSize;
  if (parsed.data.coverEnabled !== undefined) patch.cover_enabled = parsed.data.coverEnabled;
  if (parsed.data.layoutFormat) patch.layout_format = parsed.data.layoutFormat;
  if (parsed.data.draftingMode) patch.drafting_mode = parsed.data.draftingMode;
  if (parsed.data.lengthPreset) patch.length_preset = parsed.data.lengthPreset;
  if (parsed.data.tone) patch.tone = parsed.data.tone;
  if (parsed.data.structuredData) {
    patch.structured_data = { ...document.structured_data, ...parsed.data.structuredData };
  }

  await supabase.from("documents").update(patch).eq("id", document.id);

  await logAuditEvent({
    organizationId,
    action: "document_updated",
    resourceType: "document",
    resourceId: document.id,
    metadata: { version: nextVersion },
  });

  revalidatePath(`/app/documents/${document.id}`);
  return { id: document.id };
}

export async function markDocumentReviewedAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role, user } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: "Somente a profissional responsável revisa documentos clínicos." };
  }
  const parsed = reviewDocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) return { error: "Documento não encontrado." };
  if (document.status !== "draft" && document.status !== "under_review") {
    return { error: "Este documento não está em rascunho para revisão." };
  }
  const version = await getLatestVersion(document.id);
  const hash =
    version?.content_sha256 ??
    contentHash(version?.body_snapshot ?? "", version?.sections_snapshot ?? []);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("documents")
    .update({
      status: "reviewed",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_sha256: hash,
    })
    .eq("id", document.id)
    .eq("organization_id", organizationId);
  if (error) return { error: "Não foi possível registrar a revisão agora." };
  await logAuditEvent({
    organizationId,
    action: "document_reviewed",
    resourceType: "document",
    resourceId: document.id,
    metadata: { document_version: version?.version ?? document.current_version },
  });
  revalidatePath(`/app/documents/${document.id}`);
  return { id: document.id };
}

export async function issueStudioDocumentAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const parsed = issueStudioDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) return { error: "Documento não encontrado." };
  if (!document.system_template_key) {
    return issueClassicDocumentAction(document.id);
  }
  if (document.status !== "draft" && document.status !== "reviewed" && document.status !== "under_review") {
    return { error: "Este documento já foi emitido ou cancelado." };
  }

  const template = getSystemTemplate(document.system_template_key);
  if (document.sensitivity === "clinical") {
    if (!parsed.data.reviewedContentConfirmed || !parsed.data.purposeAdequacyConfirmed) {
      return { error: "Confirme a revisão integral e a adequação à finalidade antes de emitir." };
    }
  }
  if (!parsed.data.previewChecked) {
    return { error: "Confirme que conferiu o preview do PDF antes de emitir." };
  }
  if (template?.guardrails.requiresTechnicalFoundation && !parsed.data.technicalFoundationConfirmed) {
    return { error: "Confirme que existe fundamentação técnica suficiente para este atestado." };
  }
  if (template?.guardrails.requiresCompatibleAssessment && !parsed.data.compatibleAssessmentConfirmed) {
    return { error: "Confirme que houve avaliação psicológica compatível com este laudo." };
  }

  if (parsed.data.sections && (document.status === "draft" || document.status === "under_review")) {
    const saved = await saveStudioDraftAction({
      documentId: document.id,
      sections: parsed.data.sections,
      purpose: document.purpose,
      recipientName: document.recipient_name,
    });
    if (saved.error) return saved;
  }

  const version = await getLatestVersion(document.id);
  if (!version) return { error: "Nenhuma versão para emitir." };

  const sections = (version.sections_snapshot ?? []) as DocumentSection[];
  const body = version.body_snapshot;
  if (hasUnresolvedPlaceholders(body) || sections.some((s) => hasUnresolvedPlaceholders(`${s.title}\n${s.content}`))) {
    return { error: "Há placeholders não resolvidos ({{variável}}). Complete-os antes de emitir." };
  }

  const pdfBytes = await renderDocumentStudioPdf({
    organizationId,
    document,
    version,
    sections: sections.length > 0 ? sections : [{
      id: "body",
      type: "text",
      title: "",
      content: body,
      order: 0,
      enabled: true,
      pageBreakBefore: false,
    }],
    includeManualSignature: true,
  });
  const storagePath = buildStoragePath(
    organizationId,
    document.id,
    `${document.id}-v${version.version}.pdf`,
  );
  try {
    await uploadGeneratedFile(DOCUMENT_BUCKETS.clinicalDocuments, storagePath, pdfBytes, "application/pdf");
  } catch {
    return { error: "Não foi possível gerar o arquivo do documento agora." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: fileError } = await supabase.from("document_files").insert({
    document_id: document.id,
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
    .eq("id", document.id);
  if (updateError) {
    return { error: "Arquivo gerado, mas não foi possível marcar o documento como emitido." };
  }

  await logAuditEvent({
    organizationId,
    action: "document_issued",
    resourceType: "document",
    resourceId: document.id,
    metadata: { version: version.version },
  });

  revalidatePath(`/app/documents/${document.id}`);
  revalidatePath("/app/documents");
  return { id: document.id };
}

export async function markSignaturePendingAction(documentId: string): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const document = await getDocument(organizationId, documentId);
  if (!document) return { error: "Documento não encontrado." };
  if (document.status !== "issued" && document.status !== "signed") {
    return { error: "Só é possível aguardar assinatura de documento já emitido." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("documents")
    .update({ status: "signature_pending" })
    .eq("id", documentId);
  if (error) return { error: "Não foi possível atualizar o status." };
  revalidatePath(`/app/documents/${documentId}`);
  return { id: documentId };
}

export async function registerExternalSignatureAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const parsed = registerExternalSignatureSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) return { error: "Documento não encontrado." };
  const version = await getLatestVersion(document.id);
  if (!version) return { error: "Nenhuma versão encontrada." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("document_external_signature_metadata").insert({
    organization_id: organizationId,
    document_id: document.id,
    document_version_id: version.id,
    method: parsed.data.method,
    notes: parsed.data.notes || null,
  });
  if (error) return { error: "Não foi possível registrar a assinatura externa." };
  await supabase
    .from("documents")
    .update({ status: "externally_signed" })
    .eq("id", document.id);
  await logAuditEvent({
    organizationId,
    action: "document_signature_registered",
    resourceType: "document",
    resourceId: document.id,
    metadata: { method: parsed.data.method },
  });
  revalidatePath(`/app/documents/${document.id}`);
  return { id: document.id };
}

export async function registerDeliveryAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId } = await requireOrgContext();
  const parsed = registerDeliverySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) return { error: "Documento não encontrado." };
  if (
    document.status !== "issued" &&
    document.status !== "signed" &&
    document.status !== "externally_signed" &&
    document.status !== "signature_pending" &&
    document.status !== "delivered"
  ) {
    return { error: "Só é possível registrar entrega de documento emitido." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("document_delivery").insert({
    organization_id: organizationId,
    document_id: document.id,
    recipient_name: parsed.data.recipientName,
    delivered_at: parsed.data.deliveredAt,
    method: parsed.data.method,
    receipt_confirmed: parsed.data.receiptConfirmed,
    devolution_done: parsed.data.devolutionDone,
    devolution_at: parsed.data.devolutionAt || null,
    notes: parsed.data.notes || null,
  });
  if (error) return { error: "Não foi possível registrar a entrega." };
  await supabase.from("documents").update({ status: "delivered" }).eq("id", document.id);
  await logAuditEvent({
    organizationId,
    action: "document_delivered",
    resourceType: "document",
    resourceId: document.id,
    metadata: { method: parsed.data.method },
  });
  revalidatePath(`/app/documents/${document.id}`);
  return { id: document.id };
}

export async function duplicateDocumentAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role, user } = await requireOrgContext();
  const parsed = duplicateDocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const source = await getDocument(organizationId, parsed.data.documentId);
  if (!source) return { error: "Documento não encontrado." };
  const version = await getLatestVersion(source.id);
  if (!isClinicalPractitioner(role) && source.sensitivity !== "administrative") {
    return { error: "A secretaria só duplica documentos administrativos." };
  }
  if (source.patient_id) {
    const patient = await getPatient(organizationId, source.patient_id);
    if (
      source.sensitivity === "clinical" &&
      patient &&
      !canAccessPatientClinical({
        role,
        userId: user.id,
        responsiblePsychologistUserId: patient.responsible_psychologist_user_id,
      })
    ) {
      return { error: "Somente a psicóloga responsável duplica este documento." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      organization_id: organizationId,
      patient_id: source.patient_id,
      title: `${source.title} (cópia)`,
      document_kind: source.document_kind,
      sensitivity: source.sensitivity,
      system_template_key: source.system_template_key,
      visual_profile: source.visual_profile,
      logo_mode: source.logo_mode,
      logo_align: source.logo_align,
      logo_size: source.logo_size,
      recipient_name: source.recipient_name,
      purpose: source.purpose,
      structured_data: source.structured_data,
      drafting_mode: "manual",
      length_preset: source.length_preset,
      tone: source.tone,
      cover_enabled: source.cover_enabled,
      layout_format: source.layout_format,
    })
    .select("id")
    .single();
  if (error || !document) return { error: "Não foi possível duplicar o documento." };
  await supabase.from("document_versions").insert({
    document_id: document.id,
    organization_id: organizationId,
    version: 1,
    body_snapshot: version?.body_snapshot ?? "",
    variables_snapshot: version?.variables_snapshot ?? {},
    sections_snapshot: version?.sections_snapshot ?? [],
    content_sha256: version?.content_sha256 ?? null,
  });
  await logAuditEvent({
    organizationId,
    action: "document_template_duplicated",
    resourceType: "document",
    resourceId: document.id,
    metadata: { source_id: source.id },
  });
  revalidatePath("/app/documents");
  return { id: document.id };
}

export async function saveDocumentAsTemplateAction(input: unknown): Promise<DocumentActionResult> {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { error: "Somente a psicóloga administradora salva modelos da clínica." };
  }
  const parsed = saveAsTemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const document = await getDocument(organizationId, parsed.data.documentId);
  if (!document) return { error: "Documento não encontrado." };
  const version = await getLatestVersion(document.id);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_templates")
    .insert({
      organization_id: organizationId,
      name: parsed.data.name,
      document_kind: document.document_kind,
      default_sensitivity: document.sensitivity,
      body_template: version?.body_snapshot ?? "",
      description: parsed.data.description ?? "",
      category: parsed.data.category ?? "meus-modelos",
      source_system_template_key: document.system_template_key,
      is_favorite: parsed.data.favorite ?? false,
      body_sections: version?.sections_snapshot ?? [],
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível salvar o modelo." };
  revalidatePath("/app/documents");
  return { id: data.id };
}

export async function toggleTemplateFavoriteAction(templateKey: string): Promise<DocumentActionResult> {
  const { organizationId, user } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("document_template_favorites")
    .select("template_key")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("template_key", templateKey)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("document_template_favorites")
      .delete()
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("template_key", templateKey);
  } else {
    await supabase.from("document_template_favorites").insert({
      organization_id: organizationId,
      user_id: user.id,
      template_key: templateKey,
    });
  }
  revalidatePath("/app/documents");
  return { id: templateKey };
}

export async function importScheduledEncountersAction(documentId: string): Promise<
  DocumentActionResult & { encounters?: string }
> {
  const { organizationId } = await requireOrgContext();
  const document = await getDocument(organizationId, documentId);
  if (!document?.patient_id) return { error: "Documento sem paciente para importar agenda." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, modality")
    .eq("organization_id", organizationId)
    .eq("patient_id", document.patient_id)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true })
    .limit(8);
  if (error) return { error: "Não foi possível ler a agenda agora." };
  if (!data || data.length === 0) {
    return { error: "Não há encontros futuros na agenda para importar." };
  }
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const modalityLabel: Record<string, string> = {
    in_person: "presencial",
    online: "online",
    hybrid: "híbrido",
  };
  const lines = data.map((row) => {
    const start = new Date(row.starts_at as string);
    return `- ${weekday.format(start)}, ${time.format(start)}, ${modalityLabel[row.modality as string] ?? row.modality}`;
  });
  return { id: documentId, encounters: lines.join("\n") };
}

const AI_COMMANDS = [
  "desenvolver",
  "expandir",
  "resumir",
  "tornar mais técnico",
  "tornar mais formal",
  "melhorar clareza",
  "melhorar coesão",
  "reduzir redundância",
  "adaptar ao destinatário",
  "adaptar à finalidade",
  "reformular",
] as const;

export async function generateDocumentAiDraftAction(input: {
  documentId: string;
  command?: (typeof AI_COMMANDS)[number];
  sectionId?: string;
  answers?: Record<string, string>;
  selectedContext?: Partial<DocumentChartImportSelection> & { sessions?: boolean };
  contextPreviewAcknowledged: boolean;
}): Promise<DocumentActionResult & { draft?: string; model?: string }> {
  const { organizationId, role, user } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { error: "Somente a profissional responsável usa a redação assistida." };
  }
  if (!input.contextPreviewAcknowledged) {
    return { error: "Confirme os dados que serão utilizados antes de gerar o rascunho." };
  }
  const document = await getDocument(organizationId, input.documentId);
  if (!document) return { error: "Documento não encontrado." };
  if (document.status !== "draft" && document.status !== "under_review") {
    return { error: "A IA só redige rascunhos." };
  }

  if (input.selectedContext && document.patient_id) {
    const consent = await resolveConsentState(organizationId, document.patient_id);
    if (!consent.state.aiProcessingAllowed) {
      return { error: "Consentimento de apoio de IA não está válido para este paciente." };
    }
  }

  const rate = consumeAiRateLimit(organizationId, user.id);
  if (!rate.allowed) return { error: AI_RATE_LIMIT_MESSAGE };

  const template = document.system_template_key
    ? getSystemTemplate(document.system_template_key)
    : null;
  const version = await getLatestVersion(document.id);
  let chartContext = "";
  const selected = input.selectedContext;
  const importingChart = Boolean(
    selected &&
      (selected.formulation ||
        selected.therapyGoals ||
        selected.lastSession ||
        selected.lastThreeSessions ||
        selected.dpep ||
        selected.additionalNotes),
  );
  if (document.patient_id && importingChart && selected) {
    const built = await loadDocumentChartContext({
      organizationId,
      patientId: document.patient_id,
      selection: {
        formulation: Boolean(selected.formulation),
        therapyGoals: Boolean(selected.therapyGoals),
        lastSession: Boolean(selected.lastSession),
        lastThreeSessions: Boolean(selected.lastThreeSessions),
        dpep: Boolean(selected.dpep),
        additionalNotes: Boolean(selected.additionalNotes),
      },
    });
    if ("error" in built) return { error: built.error };
    chartContext = built.minimizedCaseContext;
  }

  const env = getServerEnv();
  const model = geminiDocumentsModel(env);
  const client = new GeminiClient({ apiKey: env.GEMINI_API_KEY });
  const command = input.command ? `Comando: ${input.command}.` : "Gere ou desenvolva o rascunho das seções.";
  const userContent = [
    `Modelo: ${template?.name ?? document.title}`,
    `Tipo: ${document.document_kind}`,
    `Finalidade: ${document.purpose ?? "não informada"}`,
    `Destinatário: ${document.recipient_name ?? "não informado"}`,
    `Tom: ${document.tone}`,
    `Extensão: ${document.length_preset}`,
    template ? `Instruções do modelo:\n${template.aiInstructions}` : "",
    template ? `Guardrails: nunca inventar ${template.guardrails.neverInvent.join(", ")}.` : "",
    input.answers ? `Respostas da profissional:\n${JSON.stringify(input.answers)}` : "",
    chartContext ? `Contexto clínico SELECIONADO (não envie além disto):\n${chartContext}` : "Sem importação de prontuário.",
    version ? `Texto atual:\n${version.body_snapshot.slice(0, 12000)}` : "",
    input.sectionId ? `Foque na seção ${input.sectionId}.` : "",
    command,
    "Responda em português brasileiro, em prosa desenvolvida, sem listas telegráficas. Se faltar dado, use [[REVISAR: ...]].",
  ]
    .filter(Boolean)
    .join("\n\n");

  let draft: string;
  try {
    draft = await client.generateText({
      model,
      systemInstruction: RUNTIME_PROMPTS.documentStudio,
      userContent,
    });
  } catch {
    return { error: "A redação assistida não pôde ser concluída agora." };
  }

  await logAuditEvent({
    organizationId,
    action: "document_ai_draft_generated",
    resourceType: "document",
    resourceId: document.id,
    metadata: { model, command: input.command ?? "draft" },
  });

  return { id: document.id, draft, model };
}

export async function listDocumentDeliveries(documentId: string) {
  return listDeliveries(documentId);
}

export { cancelDocumentAction };
