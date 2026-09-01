import { z } from "zod";
import { isValidCpf } from "@/lib/utils/brazil-tax-id";

export const PATIENT_STATUS_VALUES = [
  "active",
  "paused",
  "discharged",
  "archived",
] as const;
export type PatientStatus = (typeof PATIENT_STATUS_VALUES)[number];

export const PATIENT_ELIMINATION_STATUS_VALUES = [
  "active",
  "elimination_requested",
  "partially_eliminated",
  "eliminated",
] as const;
export type PatientEliminationStatus = (typeof PATIENT_ELIMINATION_STATUS_VALUES)[number];

export const CONSULTATION_MODALITY_VALUES = [
  "in_person",
  "online",
  "hybrid",
] as const;
export type ConsultationModality = (typeof CONSULTATION_MODALITY_VALUES)[number];

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: "Ativo",
  paused: "Em pausa",
  discharged: "Alta",
  archived: "Arquivado",
};

export const MODALITY_LABELS: Record<ConsultationModality, string> = {
  in_person: "Presencial",
  online: "Online",
  hybrid: "Híbrido",
};

export const responsibleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do responsável.")
    .max(160, "Nome muito longo."),
  relationship: z
    .string()
    .trim()
    .min(2, "Informe o vínculo (ex.: mãe, pai, tutor legal).")
    .max(80, "Vínculo muito longo."),
  phone: z
    .string()
    .trim()
    .min(8, "Informe um telefone válido.")
    .max(20, "Telefone muito longo."),
  email: z
    .string()
    .trim()
    .email("Informe um e-mail válido.")
    .optional()
    .or(z.literal("")),
});

export type ResponsibleValues = z.infer<typeof responsibleSchema>;

export const patientFormSchema = z.object({
  // Seção 1 — Identificação
  preferredName: z
    .string()
    .trim()
    .min(2, "Informe o nome preferencial.")
    .max(160, "Nome muito longo."),
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome completo.")
    .max(200, "Nome muito longo."),
  birthDate: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || !Number.isNaN(Date.parse(value)),
      "Data de nascimento inválida.",
    )
    .refine(
      (value) => !value || new Date(value) <= new Date(),
      "Data de nascimento não pode ser no futuro.",
    ),
  cpf: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => !value || isValidCpf(value), "CPF inválido."),

  // Seção 2 — Contato e responsáveis
  phone: z.string().trim().max(20, "Telefone muito longo.").optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Informe um e-mail válido.")
    .optional()
    .or(z.literal("")),
  responsibles: z.array(responsibleSchema).max(6, "Máximo de 6 responsáveis."),

  // Seção 3 — Atendimento e situação
  modality: z.enum(CONSULTATION_MODALITY_VALUES),
  status: z.enum(PATIENT_STATUS_VALUES),

  // Seção 4 — Financeiro e termos
  defaultSessionValue: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || (!Number.isNaN(Number(value)) && Number(value) >= 0),
      "Informe um valor válido.",
    ),
  responsiblePsychologistUserId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("")),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export const patientRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  public_code: z.string(),
  preferred_name: z.string(),
  full_name: z.string(),
  birth_date: z.string().nullable(),
  cpf: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  responsibles: z.array(responsibleSchema),
  modality: z.enum(CONSULTATION_MODALITY_VALUES),
  status: z.enum(PATIENT_STATUS_VALUES),
  default_session_value: z.union([z.string(), z.number()]).nullable(),
  photo_path: z.string().nullable().optional().default(null),
  responsible_psychologist_user_id: z.string().uuid().nullable(),
  elimination_status: z
    .enum(PATIENT_ELIMINATION_STATUS_VALUES)
    .optional()
    .default("active"),
  elimination_requested_at: z.string().nullable().optional().default(null),
  elimination_completed_at: z.string().nullable().optional().default(null),
  elimination_retained_reason: z.string().nullable().optional().default(null),
  created_at: z.string(),
  updated_at: z.string(),
});

export type PatientRow = z.infer<typeof patientRowSchema>;

export interface PatientDirectoryRow {
  patient: PatientRow;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  pendingClinical: number;
}

/**
 * The administrative patient DTO the Secretary receives is this same shape:
 * `patients` carries no clinical field by design (docs/04-data-model.md), so
 * there is no separate "stripped" type to keep in sync — the boundary is the
 * table itself plus `patient_clinical_profile` never being queried for that
 * role (see queries.ts / RLS on patient_clinical_profile).
 */
export type AdministrativePatientDTO = PatientRow;

export const patientClinicalProfileSchema = z.object({
  patient_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  chief_complaint: z.string().nullable(),
  history: z.string().nullable(),
  therapy_goals: z.string().nullable(),
  schemas: z.string().nullable(),
  core_beliefs: z.string().nullable(),
  general_clinical_notes: z.string().nullable(),
});

export type PatientClinicalProfile = z.infer<typeof patientClinicalProfileSchema>;

export const clinicalProfileFormSchema = z.object({
  chiefComplaint: z.string().trim().max(4000).optional().or(z.literal("")),
  history: z.string().trim().max(8000).optional().or(z.literal("")),
  therapyGoals: z.string().trim().max(4000).optional().or(z.literal("")),
  schemas: z.string().trim().max(4000).optional().or(z.literal("")),
  coreBeliefs: z.string().trim().max(4000).optional().or(z.literal("")),
  generalClinicalNotes: z.string().trim().max(8000).optional().or(z.literal("")),
});

export type ClinicalProfileFormValues = z.infer<typeof clinicalProfileFormSchema>;

export const PATIENT_STATUS_BADGE: Record<
  PatientStatus,
  "active" | "attention" | "completed" | "cancelled"
> = {
  active: "active",
  paused: "attention",
  discharged: "completed",
  archived: "cancelled",
};
