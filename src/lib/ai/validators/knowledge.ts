import { z } from "zod";

// Zod mirrors of src/lib/ai/contracts/knowledge.ts.

export const EVIDENCE_STATUS_VALUES = [
  "SUFICIENTE",
  "PARCIAL",
  "INSUFICIENTE",
  "CONFLITANTE",
] as const;
export const SUPPORT_LEVEL_VALUES = ["ALTA", "MODERADA", "BAIXA", "INSUFICIENTE"] as const;
export const SOURCE_ROLE_VALUES = [
  "GUIDELINE",
  "SYSTEMATIC_REVIEW_META_ANALYSIS",
  "PRIMARY_STUDY",
  "TEXTBOOK_CHAPTER",
  "THEORETICAL_CONCEPTUAL",
  "CONSENSUS_POSITION",
  "EDUCATIONAL",
  "OTHER",
  "UNKNOWN",
] as const;

const stringArray = z.array(z.string()).default([]);

export const knowledgeOutputSchema = z
  .object({
    directAnswer: z.string(),
    evidenceStatus: z.enum(EVIDENCE_STATUS_VALUES),
    synthesis: z.string(),
    centralClaims: z
      .array(
        z
          .object({
            claim: z.string(),
            claimType: z.enum(["FATO_FONTE", "SINTESE", "INTERPRETACAO"]),
            sourceIds: stringArray,
          })
          .strict(),
      )
      .default([]),
    citations: z
      .array(
        z
          .object({
            sourceId: z.string(),
            title: z.string().nullable(),
            location: z.string().nullable(),
            supportedClaim: z.string(),
          })
          .strict(),
      )
      .default([]),
    sourceAppraisal: z
      .array(
        z
          .object({
            sourceId: z.string(),
            sourceRole: z.enum(SOURCE_ROLE_VALUES),
            roleInAnswer: z.string(),
            appraisalLimits: stringArray,
          })
          .strict(),
      )
      .default([]),
    convergences: stringArray,
    disagreements: z
      .array(
        z
          .object({
            topic: z.string(),
            positions: z
              .array(
                z
                  .object({ position: z.string(), sourceIds: stringArray })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .default([]),
    clinicalApplicability: z
      .object({
        enabled: z.boolean(),
        text: z.string().nullable(),
        inferences: z
          .array(
            z
              .object({
                inference: z.string(),
                caseBasis: stringArray,
                sourceBasis: stringArray,
                supportLevel: z.enum(SUPPORT_LEVEL_VALUES),
              })
              .strict(),
          )
          .default([]),
        contextFit: stringArray,
        competenceConsiderations: stringArray,
        cautions: stringArray,
      })
      .strict(),
    limitations: stringArray,
    nextQuestions: stringArray,
  })
  .strict();
export type KnowledgeOutput = z.infer<typeof knowledgeOutputSchema>;

export const knowledgeIngestionOutputSchema = z
  .object({
    title: z.string().nullable(),
    authors: stringArray,
    year: z.number().int().nullable(),
    edition: z.string().nullable(),
    documentType: z.string().nullable(),
    studyDesignOrSourceRole: z.string().nullable(),
    language: z.string().nullable(),
    theoreticalApproaches: stringArray,
    populationContext: stringArray,
    mainTopics: stringArray,
    systemTags: stringArray,
  })
  .strict();
export type KnowledgeIngestionOutput = z.infer<typeof knowledgeIngestionOutputSchema>;
