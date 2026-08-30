import { describe, expect, it } from "vitest";
import {
  PATIENT_DATA_CLASS_POLICIES,
  policiesByKind,
} from "@/domain/patient-data-inventory";
import {
  buildEliminationReport,
  eliminationPhraseMatches,
  expectedEliminationPhrase,
  mapVerifyRow,
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

  it("classifica cada classe com política explícita", () => {
    expect(PATIENT_DATA_CLASS_POLICIES.length).toBeGreaterThan(10);
    expect(policiesByKind("DELETE").every((item) => item.policy === "DELETE")).toBe(true);
    expect(
      PATIENT_DATA_CLASS_POLICIES.every((item) =>
        ["DELETE", "ANONYMIZE", "RETAIN_WITH_LEGAL_REASON"].includes(item.policy),
      ),
    ).toBe(true);
  });

  it("retém prontuário/financeiro/consentimento e só elimina quando não há o que guardar", () => {
    const onlyCadastro = buildEliminationReport({
      publicCode: "PAC-001",
      preferredName: "Beatriz",
      presentClasses: ["patient_identifiers", "audit_events"],
    });
    expect(onlyCadastro.outcome).toBe("eliminated");
    expect(onlyCadastro.retainedReason).toBeNull();

    const withClinic = buildEliminationReport({
      publicCode: "PAC-001",
      preferredName: "Beatriz",
      presentClasses: [
        "patient_identifiers",
        "clinical_sessions",
        "session_dpep",
        "session_transcript_segments",
        "financial_charges_payments",
        "consents",
        "audit_events",
      ],
    });
    expect(withClinic.outcome).toBe("partially_eliminated");
    expect(withClinic.eliminate[0]).toContain("PAC-001");
    expect(withClinic.retain.join(" ")).toMatch(/clinical_sessions|financial|consents/i);
  });

  it("nunca declara eliminated quando a verificação ainda vê classes a apagar", () => {
    const verify = mapVerifyRow({
      status: "eliminated",
      remaining_data_classes: ["patient_attachments"],
      retained_data_classes: [],
      errors: [],
    });
    expect(verify.status).toBe("partially_eliminated");
    expect(verify.remainingDataClasses).toContain("patient_attachments");
  });
});
