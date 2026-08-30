import { z } from "zod";

export const DOCUMENT_KIND_VALUES = [
  "laudo",
  "relatorio",
  "atestado",
  "declaracao",
  "encaminhamento",
  "recibo",
  "tcle",
  "contrato",
  "branco",
  "outro",
  "parecer",
  "autorizacao",
  "requerimento",
  "protocolo",
] as const;
export type DocumentKind = (typeof DOCUMENT_KIND_VALUES)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  laudo: "Laudo psicológico",
  relatorio: "Relatório",
  atestado: "Atestado psicológico",
  declaracao: "Declaração",
  encaminhamento: "Encaminhamento",
  recibo: "Recibo",
  tcle: "TCLE",
  contrato: "Contrato",
  branco: "Em branco",
  outro: "Outro",
  parecer: "Parecer psicológico",
  autorizacao: "Autorização",
  requerimento: "Requerimento",
  protocolo: "Protocolo",
};

/** Regulated psychological documents vs assistential/administrative kinds. */
export const REGULATED_PSYCHOLOGICAL_KINDS: DocumentKind[] = [
  "declaracao",
  "atestado",
  "relatorio",
  "laudo",
  "parecer",
];

/** document_kind values whose sensitivity the database forces regardless of input. */
export const FORCED_CLINICAL_KINDS: DocumentKind[] = [
  "laudo",
  "relatorio",
  "atestado",
  "encaminhamento",
  "parecer",
];
export const FORCED_ADMINISTRATIVE_KINDS: DocumentKind[] = [
  "recibo",
  "autorizacao",
  "requerimento",
  "protocolo",
];

export const DOCUMENT_SENSITIVITY_VALUES = ["administrative", "clinical"] as const;
export type DocumentSensitivity = (typeof DOCUMENT_SENSITIVITY_VALUES)[number];

export const DOCUMENT_STATUS_VALUES = [
  "draft",
  "under_review",
  "reviewed",
  "issued",
  "signature_pending",
  "signed",
  "externally_signed",
  "delivered",
  "canceled",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS_VALUES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Rascunho",
  under_review: "Em revisão",
  reviewed: "Revisado",
  issued: "Emitido",
  signature_pending: "Assinatura pendente",
  signed: "Assinado",
  externally_signed: "Assinado externamente",
  delivered: "Entregue",
  canceled: "Cancelado",
};

export const VISUAL_PROFILE_VALUES = ["essencial", "clinica", "institucional", "premium"] as const;
export type VisualProfile = (typeof VISUAL_PROFILE_VALUES)[number];

export const LOGO_MODE_VALUES = [
  "clinic_default",
  "principal",
  "horizontal",
  "profissional",
  "none",
] as const;
export type LogoMode = (typeof LOGO_MODE_VALUES)[number];

export const LOGO_ALIGN_VALUES = ["left", "center", "right"] as const;
export type LogoAlign = (typeof LOGO_ALIGN_VALUES)[number];

export const LOGO_SIZE_VALUES = ["small", "medium", "large", "custom"] as const;
export type LogoSize = (typeof LOGO_SIZE_VALUES)[number];

export const DRAFTING_MODE_VALUES = ["manual", "ai_assisted"] as const;
export type DraftingMode = (typeof DRAFTING_MODE_VALUES)[number];

export const LENGTH_PRESET_VALUES = ["objetivo", "completo", "detalhado"] as const;
export type LengthPreset = (typeof LENGTH_PRESET_VALUES)[number];

export const DOCUMENT_TONE_VALUES = [
  "tecnico_clinico",
  "interdisciplinar",
  "formal",
  "institucional",
  "objetivo",
] as const;
export type DocumentTone = (typeof DOCUMENT_TONE_VALUES)[number];

export const LAYOUT_FORMAT_VALUES = ["tradicional", "livreto"] as const;
export type LayoutFormat = (typeof LAYOUT_FORMAT_VALUES)[number];

export const DELIVERY_METHOD_VALUES = [
  "presencial",
  "download_seguro",
  "email",
  "outro",
] as const;
export type DeliveryMethod = (typeof DELIVERY_METHOD_VALUES)[number];

export const EXTERNAL_SIGNATURE_METHOD_VALUES = [
  "manual",
  "govbr_external",
  "icp_external",
  "other_verified",
] as const;
export type ExternalSignatureMethod = (typeof EXTERNAL_SIGNATURE_METHOD_VALUES)[number];

export const DOCUMENT_SECTION_TYPE_VALUES = [
  "text",
  "analysis",
  "conclusion",
  "observation",
  "table",
  "references",
  "page_break",
] as const;
export type DocumentSectionType = (typeof DOCUMENT_SECTION_TYPE_VALUES)[number];

export const documentSectionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(DOCUMENT_SECTION_TYPE_VALUES),
  title: z.string(),
  content: z.string(),
  order: z.number().int().nonnegative(),
  enabled: z.boolean(),
  pageBreakBefore: z.boolean(),
});
export type DocumentSection = z.infer<typeof documentSectionSchema>;

export const documentTemplateRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string(),
  document_kind: z.enum(DOCUMENT_KIND_VALUES),
  default_sensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES),
  body_template: z.string(),
  active: z.boolean(),
  created_at: z.string(),
  description: z.string().optional().default(""),
  category: z.string().optional().default("outros"),
  source_system_template_key: z.string().nullable().optional().default(null),
  is_favorite: z.boolean().optional().default(false),
  body_sections: z.unknown().optional().default([]),
});
export type DocumentTemplateRow = z.infer<typeof documentTemplateRowSchema>;

export const documentRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patient_id: z.string().uuid().nullable(),
  template_id: z.string().uuid().nullable(),
  title: z.string(),
  document_kind: z.enum(DOCUMENT_KIND_VALUES),
  sensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES),
  status: z.enum(DOCUMENT_STATUS_VALUES),
  current_version: z.number().int().positive(),
  issued_at: z.string().nullable(),
  canceled_at: z.string().nullable(),
  created_at: z.string(),
  system_template_key: z.string().nullable().optional().default(null),
  visual_profile: z.enum(VISUAL_PROFILE_VALUES).optional().default("clinica"),
  logo_mode: z.enum(LOGO_MODE_VALUES).optional().default("clinic_default"),
  logo_align: z.enum(LOGO_ALIGN_VALUES).optional().default("left"),
  logo_size: z.enum(LOGO_SIZE_VALUES).optional().default("medium"),
  logo_custom_max_pt: z.number().int().nullable().optional().default(null),
  recipient_name: z.string().nullable().optional().default(null),
  purpose: z.string().nullable().optional().default(null),
  structured_data: z.record(z.string(), z.unknown()).optional().default({}),
  drafting_mode: z.enum(DRAFTING_MODE_VALUES).optional().default("manual"),
  length_preset: z.enum(LENGTH_PRESET_VALUES).optional().default("completo"),
  tone: z.enum(DOCUMENT_TONE_VALUES).optional().default("tecnico_clinico"),
  cover_enabled: z.boolean().optional().default(false),
  layout_format: z.enum(LAYOUT_FORMAT_VALUES).optional().default("tradicional"),
  reviewed_by: z.string().uuid().nullable().optional().default(null),
  reviewed_at: z.string().nullable().optional().default(null),
  review_sha256: z.string().nullable().optional().default(null),
});
export type DocumentRow = z.infer<typeof documentRowSchema>;

export const documentVersionRowSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  version: z.number().int().positive(),
  body_snapshot: z.string(),
  variables_snapshot: z
    .record(z.string(), z.unknown())
    .optional()
    .default({})
    .transform((record) =>
      Object.fromEntries(
        Object.entries(record ?? {}).map(([key, value]) => [key, String(value ?? "")]),
      ),
    ),
  created_at: z.string(),
  sections_snapshot: z.array(documentSectionSchema).optional().default([]),
  content_sha256: z.string().nullable().optional().default(null),
});
export type DocumentVersionRow = z.infer<typeof documentVersionRowSchema>;

export const documentFileRowSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  storage_path: z.string(),
  mime_type: z.string(),
  byte_size: z.number(),
  sha256: z.string(),
  generated_at: z.string(),
});
export type DocumentFileRow = z.infer<typeof documentFileRowSchema>;

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do modelo."),
  documentKind: z.enum(DOCUMENT_KIND_VALUES),
  defaultSensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES),
  bodyTemplate: z.string().max(200000).default(""),
});
export type CreateTemplateValues = z.infer<typeof createTemplateSchema>;

export const createDocumentSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  patientId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Informe o título."),
  documentKind: z.enum(DOCUMENT_KIND_VALUES),
  sensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES).nullable().optional(),
  body: z.string().max(200000).default(""),
});
export type CreateDocumentValues = z.infer<typeof createDocumentSchema>;

export const saveDraftSchema = z.object({
  documentId: z.string().uuid(),
  body: z.string().max(200000),
});

export const saveStudioDraftSchema = z.object({
  documentId: z.string().uuid(),
  body: z.string().max(200000).optional(),
  sections: z.array(documentSectionSchema).max(80),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  recipientName: z.string().trim().max(200).nullable().optional(),
  purpose: z.string().trim().max(500).nullable().optional(),
  visualProfile: z.enum(VISUAL_PROFILE_VALUES).optional(),
  logoMode: z.enum(LOGO_MODE_VALUES).optional(),
  logoAlign: z.enum(LOGO_ALIGN_VALUES).optional(),
  logoSize: z.enum(LOGO_SIZE_VALUES).optional(),
  coverEnabled: z.boolean().optional(),
  layoutFormat: z.enum(LAYOUT_FORMAT_VALUES).optional(),
  draftingMode: z.enum(DRAFTING_MODE_VALUES).optional(),
  lengthPreset: z.enum(LENGTH_PRESET_VALUES).optional(),
  tone: z.enum(DOCUMENT_TONE_VALUES).optional(),
});

export const createStudioDocumentSchema = z.object({
  templateKey: z.string().min(1),
  patientId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  recipientName: z.string().trim().max(200).optional(),
  purpose: z.string().trim().max(500).optional(),
  layoutFormat: z.enum(LAYOUT_FORMAT_VALUES).optional(),
  draftingMode: z.enum(DRAFTING_MODE_VALUES).optional(),
});

export const issueStudioDocumentSchema = z.object({
  documentId: z.string().uuid(),
  reviewedContentConfirmed: z.boolean().optional(),
  purposeAdequacyConfirmed: z.boolean().optional(),
  technicalFoundationConfirmed: z.boolean().optional(),
  compatibleAssessmentConfirmed: z.boolean().optional(),
  previewChecked: z.boolean().optional(),
  sections: z.array(documentSectionSchema).max(80).optional(),
});

export const reviewDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export const registerDeliverySchema = z.object({
  documentId: z.string().uuid(),
  recipientName: z.string().trim().min(1).max(200),
  deliveredAt: z.string().min(1),
  method: z.enum(DELIVERY_METHOD_VALUES),
  receiptConfirmed: z.boolean().default(false),
  devolutionDone: z.boolean().default(false),
  devolutionAt: z.string().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const registerExternalSignatureSchema = z.object({
  documentId: z.string().uuid(),
  method: z.enum(EXTERNAL_SIGNATURE_METHOD_VALUES),
  notes: z.string().trim().max(500).optional(),
});

export const duplicateDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export const saveAsTemplateSchema = z.object({
  documentId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(80).optional(),
  favorite: z.boolean().optional(),
});

export const documentDeliveryRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  document_id: z.string().uuid(),
  recipient_name: z.string(),
  delivered_at: z.string(),
  method: z.enum(DELIVERY_METHOD_VALUES),
  receipt_confirmed: z.boolean(),
  devolution_done: z.boolean(),
  devolution_at: z.string().nullable(),
  notes: z.string().nullable().optional().default(null),
  created_at: z.string(),
});
export type DocumentDeliveryRow = z.infer<typeof documentDeliveryRowSchema>;

export const signDocumentSchema = z.object({
  documentId: z.string().uuid(),
  confirmationAcknowledged: z.literal(true, {
    errorMap: () => ({ message: "Confirme que revisou o documento antes de assinar." }),
  }),
});

export const documentProfessionalSignatureRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_version_id: z.string().uuid(),
  professional_user_id: z.string().uuid(),
  professional_name: z.string(),
  professional_registration: z.string().nullable(),
  professional_registration_state: z.string().nullable(),
  document_sha256: z.string(),
  signed_at: z.string(),
  signature_method: z.literal("virginiapsi_internal"),
});
export type DocumentProfessionalSignatureRow = z.infer<
  typeof documentProfessionalSignatureRowSchema
>;

export const patientAttachmentRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  sensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES),
  title: z.string(),
  storage_path: z.string(),
  mime_type: z.string(),
  byte_size: z.number(),
  created_at: z.string(),
});
export type PatientAttachmentRow = z.infer<typeof patientAttachmentRowSchema>;

export const registerAttachmentSchema = z.object({
  patientId: z.string().uuid(),
  sensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES),
  title: z.string().trim().min(1, "Informe um título."),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  sha256: z.string().min(1),
});
