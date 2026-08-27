import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  SESSION_CLOSING_SCHEMA,
  SESSION_LIVE_SCHEMA,
  SESSION_PREPARATION_SCHEMA,
} from "@/lib/ai/contracts/session";
import {
  SAFETY_DOMAIN_VALUES,
  SAFETY_SEVERITY_VALUES,
  SUPPORT_LEVEL_VALUES,
  sessionClosingOutputSchema,
  sessionLiveOutputSchema,
  sessionPreparationOutputSchema,
} from "@/lib/ai/validators/session";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";

interface JsonSchemaLike {
  required?: readonly string[];
  properties?: Record<string, unknown>;
}

function requiredFieldsOf(schema: JsonSchemaLike): Set<string> {
  return new Set(schema.required ?? []);
}

function requiredKeysOfZodObject(schema: z.ZodTypeAny): Set<string> {
  const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
  return new Set(
    Object.entries(shape)
      .filter(([, field]) => !(field instanceof z.ZodOptional))
      .map(([key]) => key),
  );
}

describe("equivalência Zod <-> JSON Schema (docs/06 §Validador de runtime)", () => {
  const cases = [
    { name: "SESSION_LIVE", json: SESSION_LIVE_SCHEMA, zod: sessionLiveOutputSchema },
    {
      name: "SESSION_PREPARATION",
      json: SESSION_PREPARATION_SCHEMA,
      zod: sessionPreparationOutputSchema,
    },
    {
      name: "SESSION_CLOSING",
      json: SESSION_CLOSING_SCHEMA,
      zod: sessionClosingOutputSchema,
    },
  ];

  it.each(cases)("$name tem os mesmos campos obrigatórios no topo", ({ json, zod }) => {
    expect(requiredKeysOfZodObject(zod)).toEqual(requiredFieldsOf(json));
  });

  it.each(cases)("$name tem exatamente as mesmas chaves no topo", ({ json, zod }) => {
    const jsonKeys = new Set(Object.keys(json.properties ?? {}));
    const zodKeys = new Set(
      Object.keys((zod as unknown as { shape: Record<string, unknown> }).shape),
    );
    expect(zodKeys).toEqual(jsonKeys);
  });

  it("os três contratos usam o mesmo enum de severidade de segurança (docs/16)", () => {
    expect(SAFETY_SEVERITY_VALUES).toEqual(["none", "attention", "urgent_review"]);
    expect(SAFETY_SEVERITY_VALUES).not.toContain("informational");
  });

  it("SUPPORT_LEVEL e SAFETY_DOMAIN batem com os enums usados nos JSON Schemas", () => {
    expect(SUPPORT_LEVEL_VALUES).toEqual(["ALTA", "MODERADA", "BAIXA", "INSUFICIENTE"]);
    expect(SAFETY_DOMAIN_VALUES).toContain("SELF_HARM_SUICIDE");
    expect(SAFETY_DOMAIN_VALUES).toContain("ABUSE_SAFEGUARDING");
  });

  it("mantém os limites maxItems: 3 perguntas, 3 intervenções, 5 itens de agenda", () => {
    const liveSchema = SESSION_LIVE_SCHEMA.properties.suggestedQuestions as { maxItems: number };
    expect(liveSchema.maxItems).toBe(3);
    const interventions = SESSION_LIVE_SCHEMA.properties.possibleInterventions as {
      maxItems: number;
    };
    expect(interventions.maxItems).toBe(3);
    const agenda = SESSION_PREPARATION_SCHEMA.properties.suggestedAgenda as {
      maxItems: number;
    };
    expect(agenda.maxItems).toBe(5);

    expect(() =>
      sessionLiveOutputSchema.parse({
        summarySoFar: "x",
        observations: [],
        hypotheses: [],
        suggestedQuestions: [
          { question: "a", purpose: "p", caution: null },
          { question: "b", purpose: "p", caution: null },
          { question: "c", purpose: "p", caution: null },
          { question: "d", purpose: "p", caution: null },
        ],
        possibleInterventions: [],
        contextualConsiderations: [],
        safety: {
          severity: "none",
          domains: [],
          explicitSignals: [],
          missingInformation: [],
          clinicianReview: null,
        },
        criticalDataGaps: [],
        uncertainties: [],
      }),
    ).toThrow();
  });

  it("rejeita campo extra fora do schema (fail-closed, additionalProperties: false)", () => {
    const result = sessionLiveOutputSchema.safeParse({
      summarySoFar: "x",
      observations: [],
      hypotheses: [],
      suggestedQuestions: [],
      possibleInterventions: [],
      contextualConsiderations: [],
      safety: {
        severity: "none",
        domains: [],
        explicitSignals: [],
        missingInformation: [],
        clinicianReview: null,
      },
      criticalDataGaps: [],
      uncertainties: [],
      unexpectedField: "hack",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita severidade 'informational' (não faz parte do enum canônico)", () => {
    const result = sessionClosingOutputSchema.safeParse({
      dpepDraft: { demanda: "", procedimentos: "", evolucao: "", plano: "" },
      separateClinicalWorkingNoteCandidates: [],
      clinicalHypotheses: [],
      followUpPoints: [],
      itemsRequiringClinicianConfirmation: [],
      safety: {
        severity: "informational",
        domains: [],
        explicitSignals: [],
        missingInformation: [],
      },
      uncertainties: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("toGeminiResponseJsonSchema — adapter round-trip", () => {
  it("preserva a estrutura do contrato canônico (pass-through estrutural)", () => {
    const adapted = toGeminiResponseJsonSchema(SESSION_LIVE_SCHEMA);
    expect(adapted).toEqual(JSON.parse(JSON.stringify(SESSION_LIVE_SCHEMA)));
    expect(adapted).not.toBe(SESSION_LIVE_SCHEMA);
  });

  it("mantém additionalProperties:false e uniões type:[x,'null'] intactas", () => {
    const adapted = toGeminiResponseJsonSchema(SESSION_LIVE_SCHEMA) as unknown as {
      additionalProperties: boolean;
      properties: { safety: { properties: { clinicianReview: { type: string[] } } } };
    };
    expect(adapted.additionalProperties).toBe(false);
    expect(adapted.properties.safety.properties.clinicianReview.type).toEqual([
      "string",
      "null",
    ]);
  });

  it("uma resposta simulada que respeita o contrato adaptado ainda valida no Zod espelhado", () => {
    toGeminiResponseJsonSchema(SESSION_CLOSING_SCHEMA);
    const simulatedModelResponse = {
      dpepDraft: {
        demanda: "Ansiedade no trabalho",
        procedimentos: "Psicoeducação sobre ansiedade",
        evolucao: "Relatou melhora parcial do sono",
        plano: "Manter monitoramento semanal",
      },
      separateClinicalWorkingNoteCandidates: [],
      clinicalHypotheses: [],
      followUpPoints: ["Retomar tema do sono"],
      itemsRequiringClinicianConfirmation: [],
      safety: {
        severity: "none",
        domains: [],
        explicitSignals: [],
        missingInformation: [],
      },
      uncertainties: [],
    };

    const result = sessionClosingOutputSchema.safeParse(simulatedModelResponse);
    expect(result.success).toBe(true);
  });

  it("omite incertezas falha fechado — não trata ausência como lista vazia", () => {
    const live = sessionLiveOutputSchema.safeParse({
      summarySoFar: "Resumo",
      observations: [],
      hypotheses: [],
      suggestedQuestions: [],
      possibleInterventions: [],
      contextualConsiderations: [],
      safety: {
        severity: "none",
        domains: [],
        explicitSignals: [],
        missingInformation: [],
        clinicianReview: null,
      },
      criticalDataGaps: [],
    });
    expect(live.success).toBe(false);
  });
});
