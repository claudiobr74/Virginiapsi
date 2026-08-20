import { describe, expect, it } from "vitest";
import { RUNTIME_PROMPTS } from "@/lib/ai/prompts";
import { buildSupervisorContext, type SupervisorInput } from "@/features/supervisor/dto";

describe("composição do prompt do Supervisor (regressão contra reescrita silenciosa)", () => {
  it("combina núcleo clínico + formulação + supervisor", () => {
    const prompt = RUNTIME_PROMPTS.supervisor;
    expect(prompt).toContain("MODO: SUPERVISOR CLÍNICO IA");
    expect(prompt).toContain("REFERENCIAIS DE FORMULAÇÃO DO SUPERVISOR");
    expect(prompt).toContain("POLÍTICA DE INCERTEZA");
    expect(prompt).toContain("Você não é supervisor humano");
    expect(prompt).toContain("Não faça auto-commit de nenhum conteúdo ao prontuário");
  });
});

const BASE_INPUT: SupervisorInput = {
  organizationId: "org-1",
  patientRef: { displayLabel: "Paciente Teste" },
  supervisionGoal: "Preparar próxima sessão",
  clinicalQuestion: "Como estruturar o próximo encontro?",
  selectedSessions: "Sessão de 2026-01-01: Demanda ansiedade.",
  primaryApproach: "cbt",
};

describe("buildSupervisorContext", () => {
  it("inclui os blocos essenciais e a pergunta por último", () => {
    const rendered = buildSupervisorContext(BASE_INPUT);
    expect(rendered).toContain("[PATIENT_CONTEXT]");
    expect(rendered).toContain("[SELECTED_SESSION]");
    expect(rendered).toContain("[SUPERVISION_CONFIG]");
    expect(rendered).toContain("[USER_QUESTION]");
    expect(rendered.indexOf("[USER_QUESTION]")).toBeGreaterThan(
      rendered.indexOf("[SELECTED_SESSION]"),
    );
  });

  it("lentes adicionais só aparecem quando explicitamente selecionadas", () => {
    const withoutFrameworks = buildSupervisorContext(BASE_INPUT);
    expect(withoutFrameworks).toContain('"selectedAdditionalFrameworks": []');

    const withFrameworks = buildSupervisorContext({
      ...BASE_INPUT,
      selectedAdditionalFrameworks: ["dbt"],
    });
    expect(withFrameworks).toContain('"selectedAdditionalFrameworks"');
    expect(withFrameworks).toContain("dbt");
  });

  it("não inclui RETRIEVED_SOURCE quando não há conhecimento recuperado (Fase 8 ainda não existe)", () => {
    const rendered = buildSupervisorContext(BASE_INPUT);
    expect(rendered).not.toContain("[RETRIEVED_SOURCE]");
  });

  it("não inclui CLINICIAN_NOTE quando nem notas nem contexto da psicóloga foram informados", () => {
    const rendered = buildSupervisorContext(BASE_INPUT);
    expect(rendered).not.toContain("[CLINICIAN_NOTE]");
  });

  it("inclui CLINICIAN_NOTE combinando notas clínicas e contexto da psicóloga quando informados", () => {
    const rendered = buildSupervisorContext({
      ...BASE_INPUT,
      selectedClinicalNotes: "Hipótese de trabalho X.",
      therapistContext: "Reflexão da psicóloga sobre a aliança.",
    });
    expect(rendered).toContain("[CLINICIAN_NOTE]");
    expect(rendered).toContain("Hipótese de trabalho X.");
    expect(rendered).toContain("Reflexão da psicóloga sobre a aliança.");
  });

  it("raciocínio diagnóstico só é ativado quando explicitamente solicitado", () => {
    const withoutFlag = buildSupervisorContext(BASE_INPUT);
    expect(withoutFlag).toContain('"diagnosticReasoningRequested": false');

    const withFlag = buildSupervisorContext({
      ...BASE_INPUT,
      diagnosticReasoningRequested: true,
    });
    expect(withFlag).toContain('"diagnosticReasoningRequested": true');
  });
});
