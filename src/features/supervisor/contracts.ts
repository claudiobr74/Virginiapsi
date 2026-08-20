import { z } from "zod";

export const PRIMARY_APPROACH_VALUES = ["cbt", "schema", "integrative"] as const;
export type PrimaryApproach = (typeof PRIMARY_APPROACH_VALUES)[number];

export const PRIMARY_APPROACH_LABELS: Record<PrimaryApproach, string> = {
  cbt: "TCC",
  schema: "Terapia do Esquema",
  integrative: "Integrativa (TCC + Esquema)",
};

export const ADDITIONAL_FRAMEWORK_VALUES = [
  "act_contextual",
  "dbt",
  "psychodynamic",
  "humanistic_existential",
  "systemic",
  "interpersonal_attachment_mentalization",
  "behavioral_functional",
] as const;
export type AdditionalFramework = (typeof ADDITIONAL_FRAMEWORK_VALUES)[number];

export const ADDITIONAL_FRAMEWORK_LABELS: Record<AdditionalFramework, string> = {
  act_contextual: "ACT / Contextuais",
  dbt: "DBT",
  psychodynamic: "Psicodinâmica",
  humanistic_existential: "Humanista / Existencial",
  systemic: "Sistêmica / Familiar",
  interpersonal_attachment_mentalization: "Interpessoal / Apego / Mentalização",
  behavioral_functional: "Comportamental / Funcional",
};

export const AGE_GROUP_VALUES = ["child", "adolescent", "adult", "older_adult"] as const;
export const MODALITY_VALUES = ["individual", "couple", "family", "group"] as const;

export const supervisorFormSchema = z.object({
  patientId: z.string().uuid(),
  selectedSessionIds: z.array(z.string().uuid()).min(1, "Selecione ao menos uma sessão."),
  supervisionGoal: z.string().trim().min(1, "Informe o objetivo da supervisão."),
  clinicalQuestion: z.string().trim().min(1, "A pergunta clínica é obrigatória."),
  primaryApproach: z.enum(PRIMARY_APPROACH_VALUES),
  selectedAdditionalFrameworks: z.array(z.enum(ADDITIONAL_FRAMEWORK_VALUES)).default([]),
  ageGroup: z.enum(AGE_GROUP_VALUES).optional(),
  modality: z.enum(MODALITY_VALUES).optional(),
  relevantContext: z.string().trim().optional().or(z.literal("")),
  patientGoals: z.string().trim().optional().or(z.literal("")),
  patientPreferences: z.string().trim().optional().or(z.literal("")),
  therapistContext: z.string().trim().max(2000).optional().or(z.literal("")),
  diagnosticReasoningRequested: z.boolean().default(false),
});
export type SupervisorFormValues = z.infer<typeof supervisorFormSchema>;

export const appendSupervisorArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  targetSessionId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  fields: z.object({
    formulation: z.boolean().default(false),
    hypotheses: z.boolean().default(false),
  }),
});
export type AppendSupervisorArtifactValues = z.infer<typeof appendSupervisorArtifactSchema>;
