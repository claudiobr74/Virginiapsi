import { z } from "zod";

export const CLINICAL_SESSION_STATUS_VALUES = [
  "draft",
  "in_progress",
  "finalized",
  "canceled",
] as const;
export type ClinicalSessionStatus = (typeof CLINICAL_SESSION_STATUS_VALUES)[number];

export const CLINICAL_SESSION_STATUS_LABELS: Record<ClinicalSessionStatus, string> = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  finalized: "Finalizada",
  canceled: "Cancelada",
};

export const clinicalSessionRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable(),
  therapist_user_id: z.string().uuid(),
  status: z.enum(CLINICAL_SESSION_STATUS_VALUES),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  version: z.number().int().positive(),
  created_at: z.string(),
});
export type ClinicalSessionRow = z.infer<typeof clinicalSessionRowSchema>;

export const sessionDpepRowSchema = z.object({
  session_id: z.string().uuid(),
  demand: z.string().nullable(),
  procedures: z.string().nullable(),
  evolution: z.string().nullable(),
  plan: z.string().nullable(),
  version: z.number().int().positive(),
  updated_at: z.string(),
});
export type SessionDpepRow = z.infer<typeof sessionDpepRowSchema>;

export const sessionWorkingNotesRowSchema = z.object({
  session_id: z.string().uuid(),
  formulation: z.string().nullable(),
  hypotheses: z.string().nullable(),
  working_observations: z.string().nullable(),
  updated_at: z.string(),
});
export type SessionWorkingNotesRow = z.infer<typeof sessionWorkingNotesRowSchema>;

export const TRANSCRIPT_PROVIDER_VALUES = [
  "local-webgpu",
  "local-wasm",
  "groq-batch",
] as const;
export type TranscriptProvider = (typeof TRANSCRIPT_PROVIDER_VALUES)[number];

export const transcriptSegmentRowSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  text: z.string(),
  is_final: z.boolean(),
  start_ms: z.number().int().nullable(),
  end_ms: z.number().int().nullable(),
  provider: z.enum(TRANSCRIPT_PROVIDER_VALUES),
  provider_confidence: z.number().min(0).max(1).nullable(),
  ambiguity_flags: z
    .object({
      lowConfidence: z.boolean().optional(),
      possibleMisrecognition: z.array(z.string()).optional(),
    })
    .nullable(),
  created_at: z.string(),
});
export type TranscriptSegmentRow = z.infer<typeof transcriptSegmentRowSchema>;

export const dpepFormSchema = z.object({
  expectedVersion: z.number().int().positive(),
  demand: z.string().max(4000, "Texto muito longo.").optional().or(z.literal("")),
  procedures: z.string().max(4000, "Texto muito longo.").optional().or(z.literal("")),
  evolution: z.string().max(4000, "Texto muito longo.").optional().or(z.literal("")),
  plan: z.string().max(4000, "Texto muito longo.").optional().or(z.literal("")),
});
export type DpepFormValues = z.infer<typeof dpepFormSchema>;

export const workingNotesFormSchema = z.object({
  expectedVersion: z.number().int().positive(),
  formulation: z.string().max(4000, "Texto muito longo.").optional().or(z.literal("")),
  hypotheses: z.string().max(4000, "Texto muito longo.").optional().or(z.literal("")),
  workingObservations: z
    .string()
    .max(4000, "Texto muito longo.")
    .optional()
    .or(z.literal("")),
});
export type WorkingNotesFormValues = z.infer<typeof workingNotesFormSchema>;

export const transcriptSegmentInputSchema = z.object({
  grant: z.string().min(1),
  sessionId: z.string().uuid(),
  patientId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  text: z.string().min(1).max(8000),
  isFinal: z.boolean(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
  provider: z.enum(TRANSCRIPT_PROVIDER_VALUES),
  providerConfidence: z.number().min(0).max(1).optional(),
  ambiguityFlags: z
    .object({
      lowConfidence: z.boolean().optional(),
      possibleMisrecognition: z.array(z.string()).optional(),
    })
    .optional(),
});
export type TranscriptSegmentInput = z.infer<typeof transcriptSegmentInputSchema>;
