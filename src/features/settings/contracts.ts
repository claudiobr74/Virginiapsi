import { z } from "zod";
import {
  ORGANIZATION_ROLES,
  SECRETARY_FINANCE_ACCESS_VALUES,
  type SecretaryFinanceAccess,
} from "@/features/organizations/contracts";
import type { ConnectionRow } from "@/features/calendar/contracts";
import type { IntegrationDiagnostics } from "@/features/settings/diagnostics";

export const LOGICAL_EXPORT_SCOPES = ["organization", "patient"] as const;
export type LogicalExportScope = (typeof LOGICAL_EXPORT_SCOPES)[number];

export const LOGICAL_EXPORT_STATUSES = [
  "queued",
  "packing",
  "ready",
  "failed",
  "expired",
] as const;
export type LogicalExportStatus = (typeof LOGICAL_EXPORT_STATUSES)[number];

export const EXPORT_SCHEMA_VERSION = "tesseli-export-v1";

export const TRANSCRIPT_RETENTION_POLICIES = [
  "with_clinical_record",
  "fixed_days",
] as const;
export type TranscriptRetentionPolicy = (typeof TRANSCRIPT_RETENTION_POLICIES)[number];

export const profileFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome de exibição.")
    .max(160, "Nome muito longo."),
});
export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const clinicFormSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Informe o nome do consultório.")
    .max(160, "Nome muito longo."),
  timezone: z.string().trim().min(3).max(64),
  professionalName: z.string().trim().max(160).optional().or(z.literal("")),
  subtitle: z.string().trim().max(160).optional().or(z.literal("")),
  crp: z.string().trim().max(40).optional().or(z.literal("")),
  taxId: z.string().trim().max(20).optional().or(z.literal("")),
  pixKey: z.string().trim().max(120).optional().or(z.literal("")),
  clinicName: z.string().trim().max(160).optional().or(z.literal("")),
  companyName: z.string().trim().max(160).optional().or(z.literal("")),
  sessionDurationMinutes: z.coerce.number().int().min(10).max(480),
  monthlyGoal: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || (!Number.isNaN(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) >= 0),
      "Informe uma meta válida.",
    ),
});
export type ClinicFormValues = z.infer<typeof clinicFormSchema>;

export const appearanceFormSchema = z.object({
  greetingPrefix: z.string().trim().max(40).optional().or(z.literal("")),
  quote: z.string().trim().max(280).optional().or(z.literal("")),
});
export type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

export const securityFormSchema = z.object({
  inactivityTimeoutMinutes: z.coerce.number().int().min(1).max(240),
  secretaryFinanceAccess: z.enum(SECRETARY_FINANCE_ACCESS_VALUES),
});
export type SecurityFormValues = z.infer<typeof securityFormSchema>;

export const retentionFormSchema = z
  .object({
    sessionAudioFallbackRetentionDays: z.coerce.number().int().min(1).max(90),
    transcriptRetentionPolicy: z.enum(TRANSCRIPT_RETENTION_POLICIES),
    transcriptRetentionFixedDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
    clinicalRecordMinimumRetentionYears: z.coerce.number().int().min(5).max(50),
  })
  .superRefine((value, ctx) => {
    if (
      value.transcriptRetentionPolicy === "fixed_days" &&
      (value.transcriptRetentionFixedDays == null ||
        Number.isNaN(value.transcriptRetentionFixedDays))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transcriptRetentionFixedDays"],
        message: "Informe o prazo fixo em dias.",
      });
    }
  });
export type RetentionFormValues = z.infer<typeof retentionFormSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido.").max(320),
  role: z.enum(ORGANIZATION_ROLES),
});
export type InviteMemberValues = z.infer<typeof inviteMemberSchema>;

export const requestExportSchema = z.object({
  scope: z.enum(LOGICAL_EXPORT_SCOPES),
  patientId: z.string().uuid().optional(),
});
export type RequestExportValues = z.infer<typeof requestExportSchema>;

export const eliminationPreviewSchema = z.object({
  patientId: z.string().uuid(),
});

export const eliminationConfirmSchema = z.object({
  patientId: z.string().uuid(),
  confirmationPhrase: z.string().trim().min(8, "Digite a frase de confirmação."),
});

const nullableText = z.string().nullable().optional().default(null);
const nullableNumber = z.number().int().nullable().optional().default(null);

export const practiceSettingsRowSchema = z.object({
  organization_id: z.string().uuid(),
  professional_name: nullableText,
  subtitle: nullableText,
  crp: nullableText,
  tax_id: nullableText,
  pix_key: nullableText,
  clinic_name: nullableText,
  company_name: nullableText,
  greeting_prefix: nullableText,
  quote: nullableText,
  photo_path: nullableText,
  session_duration_minutes: z.coerce.number().int().optional().default(50),
  monthly_goal: z.union([z.string(), z.number()]).nullable().optional().default(null),
  inactivity_timeout_minutes: z.coerce.number().int().optional().default(15),
  secretary_finance_access: z
    .enum(SECRETARY_FINANCE_ACCESS_VALUES)
    .optional()
    .default("none"),
  session_audio_fallback_retention_days: z.coerce.number().int().optional().default(7),
  transcript_retention_policy: z
    .enum(TRANSCRIPT_RETENTION_POLICIES)
    .optional()
    .default("with_clinical_record"),
  transcript_retention_fixed_days: nullableNumber,
  clinical_record_minimum_retention_years: z.coerce.number().int().optional().default(5),
});
export type PracticeSettingsRow = z.infer<typeof practiceSettingsRowSchema>;

export function defaultPracticeSettings(organizationId: string): PracticeSettingsRow {
  return practiceSettingsRowSchema.parse({ organization_id: organizationId });
}

export const teamMemberRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(ORGANIZATION_ROLES),
  active: z.boolean(),
  email: z.string().nullable(),
  created_at: z.string(),
});
export type TeamMemberRow = z.infer<typeof teamMemberRowSchema>;

export const logicalExportRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  actor_user_id: z.string().uuid(),
  scope: z.enum(LOGICAL_EXPORT_SCOPES),
  patient_id: z.string().uuid().nullable(),
  schema_version: z.string(),
  status: z.enum(LOGICAL_EXPORT_STATUSES),
  storage_path: z.string().nullable(),
  package_bytes: z.number().int().nullable(),
  file_count: z.number().int().nullable(),
  package_sha256: z.string().nullable(),
  manifest_sha256: z.string().nullable(),
  error_code: z.string().nullable(),
  requested_at: z.string(),
  ready_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});
export type LogicalExportRow = z.infer<typeof logicalExportRowSchema>;

export interface ExportManifestFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ExportManifest {
  schema_version: string;
  exported_at: string;
  organization_id: string;
  organization_name: string;
  actor_user_id: string;
  scope: LogicalExportScope;
  patient_id: string | null;
  patient_public_code: string | null;
  files: ExportManifestFile[];
}

export interface SettingsSnapshot {
  profile: {
    email: string;
    fullName: string;
  };
  organization: {
    id: string;
    name: string;
    timezone: string;
    slug: string;
  };
  practice: PracticeSettingsRow;
  team: TeamMemberRow[];
  diagnostics: IntegrationDiagnostics;
  googleConnection: ConnectionRow | null;
  exports: LogicalExportRow[];
  patients: { id: string; preferred_name: string; public_code: string }[];
  secretaryFinanceAccess: SecretaryFinanceAccess;
  documentBranding?: import("@/features/documents/branding-contracts").DocumentBrandingRow | null;
  documentLogos?: import("@/features/documents/branding-contracts").DocumentLogoRow[];
  professionalPhotoUrl?: string | null;
}

export interface SettingsActionResult {
  error?: string;
  id?: string;
  url?: string;
  path?: string;
  token?: string;
}

export interface EliminationPreviewResult {
  error?: string;
  id?: string;
  publicCode?: string;
  report?: {
    eliminate: string[];
    retain: string[];
    outcome: "partially_eliminated" | "eliminated";
    retainedReason: string | null;
  };
}
