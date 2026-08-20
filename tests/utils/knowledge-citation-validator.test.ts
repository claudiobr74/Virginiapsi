import { describe, expect, it } from "vitest";
import { findFabricatedCitations } from "@/features/knowledge/citation-validator";
import type { KnowledgeOutput } from "@/lib/ai/validators/knowledge";

function baseOutput(overrides: Partial<KnowledgeOutput> = {}): KnowledgeOutput {
  return {
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
    ...overrides,
  };
}

describe("findFabricatedCitations", () => {
  it("retorna vazio quando nenhuma fonte é citada", () => {
    expect(findFabricatedCitations(baseOutput(), ["src-1"])).toEqual([]);
  });

  it("retorna vazio quando todas as citações pertencem ao retrieval", () => {
    const output = baseOutput({
      citations: [{ sourceId: "src-1", title: "x", location: null, supportedClaim: "y" }],
      centralClaims: [{ claim: "x", claimType: "FATO_FONTE", sourceIds: ["src-1"] }],
    });
    expect(findFabricatedCitations(output, ["src-1", "src-2"])).toEqual([]);
  });

  it("detecta citação de fonte não recuperada", () => {
    const output = baseOutput({
      citations: [{ sourceId: "src-99", title: null, location: null, supportedClaim: "y" }],
    });
    expect(findFabricatedCitations(output, ["src-1"])).toEqual(["src-99"]);
  });

  it("detecta sourceId inventado em centralClaims, sourceAppraisal e disagreements", () => {
    const output = baseOutput({
      centralClaims: [{ claim: "x", claimType: "SINTESE", sourceIds: ["fake-a"] }],
      sourceAppraisal: [
        { sourceId: "fake-b", sourceRole: "OTHER", roleInAnswer: "x", appraisalLimits: [] },
      ],
      disagreements: [
        {
          topic: "x",
          positions: [{ position: "y", sourceIds: ["fake-c"] }],
        },
      ],
    });
    const fabricated = findFabricatedCitations(output, ["src-1"]);
    expect(fabricated.sort()).toEqual(["fake-a", "fake-b", "fake-c"]);
  });
});
