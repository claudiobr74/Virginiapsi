import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SUPERVISOR_SCHEMA } from "@/lib/ai/contracts/supervisor";
import { supervisorOutputSchema } from "@/lib/ai/validators/supervisor";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";

function requiredKeysOfZodObject(schema: z.ZodTypeAny): Set<string> {
  const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
  return new Set(
    Object.entries(shape)
      .filter(([, field]) => !(field instanceof z.ZodOptional))
      .map(([key]) => key),
  );
}

describe("equivalência Zod <-> SUPERVISOR_SCHEMA", () => {
  it("mesmos campos obrigatórios no topo", () => {
    expect(requiredKeysOfZodObject(supervisorOutputSchema)).toEqual(
      new Set(SUPERVISOR_SCHEMA.required),
    );
  });

  it("mesmas chaves no topo", () => {
    const jsonKeys = new Set(Object.keys(SUPERVISOR_SCHEMA.properties));
    const zodKeys = new Set(
      Object.keys((supervisorOutputSchema as unknown as { shape: Record<string, unknown> }).shape),
    );
    expect(zodKeys).toEqual(jsonKeys);
  });

  it("usa o mesmo enum canônico de severidade (none|attention|urgent_review)", () => {
    const jsonEnum = SUPERVISOR_SCHEMA.properties.riskAndEthics.items.properties.severity.enum;
    expect([...jsonEnum]).toEqual(["none", "attention", "urgent_review"]);
  });

  it("rejeita campo extra fora do schema (additionalProperties: false)", () => {
    const minimalValid = {
      directAnswer: "x",
      clinicalSynthesis: "x",
      goalsPreferencesAndContext: {
        goals: [],
        preferences: [],
        strengths: [],
        contextualFactors: [],
      },
      relevantData: [],
      hypotheses: [],
      cbtFormulation: { summary: "", maintenanceCycles: [], resources: [], uncertainties: [] },
      schemaTherapyFormulation: {
        summary: "",
        possibleSchemas: [],
        possibleModes: [],
        copingStyles: [],
        needs: [],
        healthyResources: [],
        uncertainties: [],
      },
      additionalFrameworks: [],
      therapeuticProcess: {
        observations: [],
        possibleRuptures: [],
        repairsOrStrengths: [],
        therapistFactors: [],
        boundaries: [],
        uncertainties: [],
      },
      possibleBlindSpots: [],
      prioritizedInterventions: [],
      suggestedQuestions: [],
      nextSessionPlan: [],
      competenceAndSupervision: {
        competenceFlags: [],
        humanSupervisionRecommended: false,
        reasons: [],
        referralConsiderations: [],
      },
      riskAndEthics: [],
      limitations: [],
    };

    expect(supervisorOutputSchema.safeParse(minimalValid).success).toBe(true);
    expect(
      supervisorOutputSchema.safeParse({ ...minimalValid, unexpectedField: "hack" }).success,
    ).toBe(false);
    expect(
      supervisorOutputSchema.safeParse({
        ...minimalValid,
        riskAndEthics: [
          {
            issue: "x",
            severity: "informational",
            basis: [],
            missingInformation: [],
            clinicianReview: "",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("adapter de schema preserva a estrutura (pass-through)", () => {
    const adapted = toGeminiResponseJsonSchema(SUPERVISOR_SCHEMA);
    expect(adapted).toEqual(JSON.parse(JSON.stringify(SUPERVISOR_SCHEMA)));
  });
});
