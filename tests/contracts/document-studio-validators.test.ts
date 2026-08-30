import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DOCUMENT_STUDIO_DRAFT_SCHEMA } from "@/lib/ai/contracts/documents";
import { documentStudioDraftOutputSchema } from "@/lib/ai/validators/documents";
import { toGeminiResponseJsonSchema } from "@/lib/ai/schema-adapter";

function keysOf(schema: z.ZodTypeAny): Set<string> {
  return new Set(Object.keys((schema as unknown as { shape: Record<string, unknown> }).shape));
}

describe("equivalência Zod <-> DOCUMENT_STUDIO_DRAFT_SCHEMA", () => {
  it("mesmas chaves e campos obrigatórios no topo", () => {
    expect(keysOf(documentStudioDraftOutputSchema)).toEqual(
      new Set(Object.keys(DOCUMENT_STUDIO_DRAFT_SCHEMA.properties)),
    );
    expect([...DOCUMENT_STUDIO_DRAFT_SCHEMA.required].sort()).toEqual(
      [...keysOf(documentStudioDraftOutputSchema)].sort(),
    );
  });

  it("additionalProperties false e adapter não reescreve o contrato", () => {
    expect(DOCUMENT_STUDIO_DRAFT_SCHEMA.additionalProperties).toBe(false);
    expect(toGeminiResponseJsonSchema(DOCUMENT_STUDIO_DRAFT_SCHEMA)).toEqual(DOCUMENT_STUDIO_DRAFT_SCHEMA);
  });
});
