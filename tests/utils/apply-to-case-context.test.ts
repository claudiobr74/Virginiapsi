import { describe, expect, it } from "vitest";
import {
  buildApplyToCaseMinimizedContext,
  DEFAULT_APPLY_TO_CASE_SELECTION,
  formatApplyToCasePreview,
  sanitizeClinicalText,
} from "@/features/knowledge/apply-to-case-context";

describe("contexto Aplicar ao Caso", () => {
  it("remove identificadores, e-mail, CPF e telefone", () => {
    const sanitized = sanitizeClinicalText(
      "Maria Silva, CPF 123.456.789-00, maria@example.com, tel 11988887777, objetivo de exposição.",
      ["Maria Silva"],
    );
    expect(sanitized).not.toMatch(/Maria Silva/);
    expect(sanitized).not.toMatch(/123\.456\.789-00/);
    expect(sanitized).not.toMatch(/maria@example.com/i);
    expect(sanitized).not.toMatch(/11988887777/);
    expect(sanitized).toMatch(/exposição/);
  });

  it("usa defaults conservadores e não inclui DPEP nem 3 sessões", () => {
    const built = buildApplyToCaseMinimizedContext(DEFAULT_APPLY_TO_CASE_SELECTION, {
      modality: "TCC individual",
      formulation: "Hipótese de evitação.",
      therapyGoals: "Reduzir evitação social.",
      lastSessionSummary: "Trabalhou exposição gradual.",
      lastThreeSessionsSummary: "Não deveria aparecer.",
      dpepSummary: "DPEP completo não deveria aparecer.",
      identifiers: [],
    });
    expect(built.categories).toEqual(["formulation", "therapy_goals", "last_session"]);
    expect(built.minimizedCaseContext).toMatch(/Modalidade: TCC individual/);
    expect(built.minimizedCaseContext).toMatch(/evitação social/);
    expect(built.minimizedCaseContext).not.toMatch(/Não deveria aparecer/);
    expect(built.minimizedCaseContext).not.toMatch(/DPEP completo/);
    expect(formatApplyToCasePreview(built)).toMatch(/Dados que serão enviados à IA/);
  });
});
