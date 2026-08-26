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
] as const;
export type DocumentKind = (typeof DOCUMENT_KIND_VALUES)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  laudo: "Laudo",
  relatorio: "Relatório",
  atestado: "Atestado",
  declaracao: "Declaração",
  encaminhamento: "Encaminhamento",
  recibo: "Recibo",
  tcle: "TCLE",
  contrato: "Contrato",
  branco: "Em branco",
  outro: "Outro",
};

/** document_kind values whose sensitivity the database forces regardless of input. */
export const FORCED_CLINICAL_KINDS: DocumentKind[] = [
  "laudo",
  "relatorio",
  "atestado",
  "encaminhamento",
];
export const FORCED_ADMINISTRATIVE_KINDS: DocumentKind[] = ["recibo"];

export const DOCUMENT_SENSITIVITY_VALUES = ["administrative", "clinical"] as const;
export type DocumentSensitivity = (typeof DOCUMENT_SENSITIVITY_VALUES)[number];

export const DOCUMENT_STATUS_VALUES = ["draft", "issued", "signed", "canceled"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS_VALUES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "Rascunho",
  issued: "Emitido",
  signed: "Assinado",
  canceled: "Cancelado",
};

export const documentTemplateRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string(),
  document_kind: z.enum(DOCUMENT_KIND_VALUES),
  default_sensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES),
  body_template: z.string(),
  active: z.boolean(),
  created_at: z.string(),
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
});
export type DocumentRow = z.infer<typeof documentRowSchema>;

export const documentVersionRowSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  version: z.number().int().positive(),
  body_snapshot: z.string(),
  variables_snapshot: z.record(z.string(), z.string()),
  created_at: z.string(),
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
  bodyTemplate: z.string().max(20000).default(""),
});
export type CreateTemplateValues = z.infer<typeof createTemplateSchema>;

export const createDocumentSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  patientId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Informe o título."),
  documentKind: z.enum(DOCUMENT_KIND_VALUES),
  sensitivity: z.enum(DOCUMENT_SENSITIVITY_VALUES).nullable().optional(),
  body: z.string().max(20000).default(""),
});
export type CreateDocumentValues = z.infer<typeof createDocumentSchema>;

export const saveDraftSchema = z.object({
  documentId: z.string().uuid(),
  body: z.string().max(20000),
});

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
