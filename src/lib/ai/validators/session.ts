import { z } from "zod";

// Zod mirrors of src/lib/ai/contracts/session.ts. Kept field-for-field and
// enum-for-enum identical on purpose — tests/contracts/session-validators.test.ts
// asserts the equivalence (docs/06-integrations.md §"Validador de runtime").
// A model response that fails this validation fails CLOSED: it is never
// persisted or shown as valid content (docs/15-runtime-ai-test-matrix.md).

export const SUPPORT_LEVEL_VALUES = ["ALTA", "MODERADA", "BAIXA", "INSUFICIENTE"] as const;
export const SAFETY_SEVERITY_VALUES = ["none", "attention", "urgent_review"] as const;
export const SAFETY_DOMAIN_VALUES = [
  "SELF_HARM_SUICIDE",
  "VIOLENCE_TO_OTHERS",
  "ABUSE_SAFEGUARDING",
  "ACUTE_MENTAL_STATE_CHANGE",
  "SUBSTANCE_RELATED",
  "EATING_DISORDER_MEDICAL_RISK",
  "OTHER",
] as const;

const supportLevelSchema = z.enum(SUPPORT_LEVEL_VALUES);
const safetySeveritySchema = z.enum(SAFETY_SEVERITY_VALUES);
const safetyDomainSchema = z.enum(SAFETY_DOMAIN_VALUES);
const questionSchema = z
  .object({
    question: z.string(),
    purpose: z.string(),
    caution: z.string().nullable(),
  })
  .strict();

export const sessionLiveOutputSchema = z
  .object({
    summarySoFar: z.string(),
    observations: z
      .array(
        z
          .object({
            text: z.string(),
            evidenceType: z.enum([
              "DADO_DOCUMENTADO",
              "RELATO_PACIENTE",
              "NOTA_CLINICA",
              "SINTESE",
            ]),
          })
          .strict(),
      )
      .default([]),
    hypotheses: z
      .array(
        z
          .object({
            text: z.string(),
            supportLevel: supportLevelSchema,
            basis: z.array(z.string()),
            alternatives: z.array(z.string()),
          })
          .strict(),
      )
      .default([]),
    suggestedQuestions: z.array(questionSchema).max(3).default([]),
    possibleInterventions: z
      .array(
        z
          .object({
            option: z.string(),
            rationale: z.string(),
            prerequisites: z.array(z.string()),
            cautions: z.array(z.string()),
          })
          .strict(),
      )
      .max(3)
      .default([]),
    contextualConsiderations: z.array(z.string()).default([]),
    safety: z
      .object({
        severity: safetySeveritySchema,
        domains: z.array(safetyDomainSchema),
        explicitSignals: z.array(z.string()),
        missingInformation: z.array(z.string()),
        clinicianReview: z.string().nullable(),
      })
      .strict(),
    criticalDataGaps: z.array(z.string()).default([]),
    uncertainties: z.array(z.string()),
  })
  .strict();
export type SessionLiveOutput = z.infer<typeof sessionLiveOutputSchema>;

export const sessionPreparationOutputSchema = z
  .object({
    continuitySummary: z.string(),
    goalsAndPreferences: z.array(z.string()).default([]),
    openLoops: z.array(z.string()).default([]),
    patternsToRevisit: z.array(z.string()).default([]),
    priorInterventionResponse: z.array(z.string()).default([]),
    homeworkReview: z.array(z.string()).default([]),
    therapeuticProcess: z.array(z.string()).default([]),
    contextualFactors: z.array(z.string()).default([]),
    suggestedAgenda: z.array(z.string()).max(5).default([]),
    questions: z.array(questionSchema).default([]),
    hypothesesToTest: z
      .array(
        z
          .object({
            hypothesis: z.string(),
            supportLevel: supportLevelSchema,
            alternatives: z.array(z.string()),
            howToCheck: z.array(z.string()),
          })
          .strict(),
      )
      .default([]),
    safetyMonitoring: z.array(z.string()).default([]),
    dataGaps: z.array(z.string()).default([]),
  })
  .strict();
export type SessionPreparationOutput = z.infer<typeof sessionPreparationOutputSchema>;

export const sessionClosingOutputSchema = z
  .object({
    dpepDraft: z
      .object({
        demanda: z.string(),
        procedimentos: z.string(),
        evolucao: z.string(),
        plano: z.string(),
      })
      .strict(),
    separateClinicalWorkingNoteCandidates: z
      .array(
        z
          .object({
            text: z.string(),
            reason: z.string(),
            storageCaution: z.string(),
          })
          .strict(),
      )
      .default([]),
    clinicalHypotheses: z
      .array(
        z
          .object({
            hypothesis: z.string(),
            supportLevel: supportLevelSchema,
            basis: z.array(z.string()),
            alternatives: z.array(z.string()),
          })
          .strict(),
      )
      .default([]),
    followUpPoints: z.array(z.string()).default([]),
    itemsRequiringClinicianConfirmation: z.array(z.string()).default([]),
    safety: z
      .object({
        severity: safetySeveritySchema,
        domains: z.array(safetyDomainSchema),
        explicitSignals: z.array(z.string()),
        missingInformation: z.array(z.string()),
      })
      .strict(),
    uncertainties: z.array(z.string()),
  })
  .strict();
export type SessionClosingOutput = z.infer<typeof sessionClosingOutputSchema>;
