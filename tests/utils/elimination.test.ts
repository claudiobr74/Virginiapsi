import { describe, expect, it } from "vitest";
import {
  buildEliminationReport,
  eliminationPhraseMatches,
  expectedEliminationPhrase,
  resolveEliminationOutcome,
} from "@/features/settings/elimination";

describe("confirmação destrutiva LGPD", () => {
  it("aceita a frase canônica e rejeita variações", () => {
    expect(expectedEliminationPhrase("PAC-007")).toBe("ELIMINAR PERMANENTEMENTE PAC-007");
    expect(eliminationPhraseMatches("eliminar permanentemente pac-007", "PAC-007")).toBe(true);
    expect(eliminationPhraseMatches("ELIMINAR PERMANENTEMENTE PAC-007", "PAC-007")).toBe(true);
    expect(eliminationPhraseMatches("ELIMINAR PERMANENTEMENTE PAC-008", "PAC-007")).toBe(false);
    expect(eliminationPhraseMatches("confirmar", "PAC-007")).toBe(false);
    expect(eliminationPhraseMatches("", "PAC-007")).toBe(false);
  });

  it("retém prontuário/financeiro/consentimento e só elimina quando não há o que guardar", () => {
    expect(
      resolveEliminationOutcome({
        clinicalSessions: 1,
        clinicalProfiles: 0,
        consents: 0,
        financialCharges: 0,
        transcriptSegments: 0,
      }).status,
    ).toBe("partially_eliminated");

    expect(
      resolveEliminationOutcome({
        clinicalSessions: 0,
        clinicalProfiles: 0,
        consents: 0,
        financialCharges: 0,
        transcriptSegments: 0,
      }).status,
    ).toBe("eliminated");

    const report = buildEliminationReport({
      publicCode: "PAC-001",
      preferredName: "Beatriz",
      counts: {
        clinicalSessions: 2,
        clinicalProfiles: 1,
        consents: 1,
        financialCharges: 3,
        transcriptSegments: 4,
      },
    });
    expect(report.eliminate[0]).toContain("PAC-001");
    expect(report.retain.join(" ")).toMatch(/prontuário|cobrança|consentimento|transcrição/i);
  });
});
