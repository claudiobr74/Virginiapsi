import { describe, expect, it } from "vitest";
import { z } from "zod";
import { KNOWLEDGE_INGESTION_SCHEMA, KNOWLEDGE_SCHEMA } from "@/lib/ai/contracts/knowledge";
import {
  knowledgeIngestionOutputSchema,
  knowledgeOutputSchema,
} from "@/lib/ai/validators/knowledge";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";

function keysOf(schema: z.ZodTypeAny): Set<string> {
  return new Set(
    Object.keys((schema as unknown as { shape: Record<string, unknown> }).shape),
  );
}

describe("equivalência Zod <-> KNOWLEDGE_SCHEMA", () => {
  it("mesmas chaves e campos obrigatórios no topo", () => {
    expect(keysOf(knowledgeOutputSchema)).toEqual(new Set(Object.keys(KNOWLEDGE_SCHEMA.properties)));
    expect([...KNOWLEDGE_SCHEMA.required].sort()).toEqual(
      [...keysOf(knowledgeOutputSchema)].sort(),
    );
  });

  it("rejeita campo extra e evidenceStatus fora do enum canônico", () => {
    const minimal = {
      directAnswer: "x",
      evidenceStatus: "SUFICIENTE",
      synthesis: "x",
      centralClaims: [],
      citations: [],
      sourceAppraisal: [],
      convergences: [],
      disagreements: [],
      clinicalApplicability: {
        enabled: false,
        text: null,
        inferences: [],
        contextFit: [],
        competenceConsiderations: [],
        cautions: [],
      },
      limitations: [],
      nextQuestions: [],
    };
    expect(knowledgeOutputSchema.safeParse(minimal).success).toBe(true);
    expect(knowledgeOutputSchema.safeParse({ ...minimal, hack: true }).success).toBe(false);
    expect(
      knowledgeOutputSchema.safeParse({ ...minimal, evidenceStatus: "TOTAL" }).success,
    ).toBe(false);
  });

  it("adapter de schema preserva a estrutura", () => {
    const adapted = toGeminiResponseJsonSchema(KNOWLEDGE_SCHEMA);
    expect(adapted).toEqual(JSON.parse(JSON.stringify(KNOWLEDGE_SCHEMA)));
  });
});

describe("equivalência Zod <-> KNOWLEDGE_INGESTION_SCHEMA", () => {
  it("mesmas chaves no topo, todas nullable/lista vazia por padrão", () => {
    expect(keysOf(knowledgeIngestionOutputSchema)).toEqual(
      new Set(Object.keys(KNOWLEDGE_INGESTION_SCHEMA.properties)),
    );
  });

  it("aceita metadados totalmente ausentes (nunca inventa)", () => {
    const result = knowledgeIngestionOutputSchema.safeParse({
      title: null,
      authors: [],
      year: null,
      edition: null,
      documentType: null,
      studyDesignOrSourceRole: null,
      language: null,
      theoreticalApproaches: [],
      populationContext: [],
      mainTopics: [],
      systemTags: [],
    });
    expect(result.success).toBe(true);
  });
});
