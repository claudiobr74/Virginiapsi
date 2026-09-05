import { describe, expect, it } from "vitest";
import {
  isAiArtifactIsolationError,
  mapAiArtifactAppendError,
} from "@/features/sessions/ai/artifact-integrity";

describe("validação de artefato de IA", () => {
  it("reconhece violação de isolamento", () => {
    expect(
      isAiArtifactIsolationError("ai_artifact_isolation_violation: patient mismatch"),
    ).toBe(true);
    expect(isAiArtifactIsolationError("ai artifact not found")).toBe(false);
  });

  it("não vaza o detalhe interno da violação para a UI", () => {
    expect(
      mapAiArtifactAppendError("ai_artifact_isolation_violation: organization mismatch"),
    ).toMatch(/não pertence/);
    expect(mapAiArtifactAppendError("ai artifact already reviewed")).toMatch(/já foi revisado/);
  });
});
