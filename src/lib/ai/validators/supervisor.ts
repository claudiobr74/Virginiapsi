import { z } from "zod";

// Zod mirror of src/lib/ai/contracts/supervisor.ts — see
// tests/contracts/supervisor-validators.test.ts for the field/enum
// equivalence check (docs/06-integrations.md §"Validador de runtime").

export const SUPPORT_LEVEL_VALUES = ["ALTA", "MODERADA", "BAIXA", "INSUFICIENTE"] as const;
export const SAFETY_SEVERITY_VALUES = ["none", "attention", "urgent_review"] as const;

const supportLevelSchema = z.enum(SUPPORT_LEVEL_VALUES);
const stringArray = z.array(z.string()).default([]);

const questionSchema = z
  .object({ question: z.string(), purpose: z.string(), caution: z.string().nullable() })
  .strict();

export const supervisorOutputSchema = z
  .object({
    directAnswer: z.string(),
    clinicalSynthesis: z.string(),
    goalsPreferencesAndContext: z
      .object({
        goals: stringArray,
        preferences: stringArray,
        strengths: stringArray,
        contextualFactors: stringArray,
      })
      .strict(),
    relevantData: z
      .array(
        z
          .object({
            text: z.string(),
            evidenceType: z.enum([
              "DADO_DOCUMENTADO",
              "RELATO_PACIENTE",
              "NOTA_CLINICA",
              "FATO_FONTE",
              "SINTESE",
            ]),
            sourceRef: z.string().nullable(),
          })
          .strict(),
      )
      .default([]),
    hypotheses: z
      .array(
        z
          .object({
            hypothesis: z.string(),
            supportingEvidence: stringArray,
            contradictoryEvidence: stringArray,
            alternatives: stringArray,
            supportLevel: supportLevelSchema,
            howToTest: stringArray,
          })
          .strict(),
      )
      .default([]),
    cbtFormulation: z
      .object({
        summary: z.string(),
        maintenanceCycles: stringArray,
        resources: stringArray,
        uncertainties: z.array(z.string()),
      })
      .strict(),
    schemaTherapyFormulation: z
      .object({
        summary: z.string(),
        possibleSchemas: stringArray,
        possibleModes: stringArray,
        copingStyles: stringArray,
        needs: stringArray,
        healthyResources: stringArray,
        uncertainties: z.array(z.string()),
      })
      .strict(),
    additionalFrameworks: z
      .array(
        z
          .object({
            framework: z.string(),
            contribution: z.string(),
            supportLevel: supportLevelSchema,
            cautions: stringArray,
          })
          .strict(),
      )
      .default([]),
    therapeuticProcess: z
      .object({
        observations: stringArray,
        possibleRuptures: stringArray,
        repairsOrStrengths: stringArray,
        therapistFactors: stringArray,
        boundaries: stringArray,
        uncertainties: z.array(z.string()),
      })
      .strict(),
    possibleBlindSpots: z
      .array(
        z
          .object({
            possibility: z.string(),
            basis: stringArray,
            alternativeExplanation: stringArray,
            howToCheck: stringArray,
          })
          .strict(),
      )
      .default([]),
    prioritizedInterventions: z
      .array(
        z
          .object({
            priority: z.number().int().min(1),
            option: z.string(),
            goal: z.string(),
            rationale: z.string(),
            prerequisites: stringArray,
            timingConsiderations: stringArray,
            competenceConsiderations: stringArray,
            cautions: stringArray,
            signalsToReassess: stringArray,
          })
          .strict(),
      )
      .default([]),
    suggestedQuestions: z.array(questionSchema).default([]),
    nextSessionPlan: z
      .array(
        z.object({ step: z.string(), goal: z.string(), flexibilityNote: z.string() }).strict(),
      )
      .default([]),
    competenceAndSupervision: z
      .object({
        competenceFlags: stringArray,
        humanSupervisionRecommended: z.boolean(),
        reasons: stringArray,
        referralConsiderations: stringArray,
      })
      .strict(),
    riskAndEthics: z
      .array(
        z
          .object({
            issue: z.string(),
            severity: z.enum(SAFETY_SEVERITY_VALUES),
            basis: stringArray,
            missingInformation: stringArray,
            clinicianReview: z.string(),
          })
          .strict(),
      )
      .default([]),
    limitations: stringArray,
  })
  .strict();

export type SupervisorOutput = z.infer<typeof supervisorOutputSchema>;
