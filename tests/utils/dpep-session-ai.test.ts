import { describe, expect, it } from "vitest";
import {
  coerceSessionClosingOutput,
  dpepFieldsHaveContent,
  emptyDpepFields,
  extractDpepDraft,
  shouldConfirmDpepReplace,
} from "@/features/sessions/ai/dpep-draft";
import { catchSessionAiFailure } from "@/features/sessions/ai/safe-action";
import {
  classifySessionAiError,
  isNextControlFlowError,
} from "@/features/sessions/ai/session-ai-errors";
import {
  SESSION_AI_EMPTY_CONTEXT_MESSAGE,
  SESSION_AI_USER_ERROR,
} from "@/features/sessions/ai/messages";
import { GeminiApiError, GeminiTimeoutError } from "@/lib/integrations/gemini/client";
import { sessionAiRequiresTranscriptionConsent } from "@/features/sessions/ai/purpose";
import {
  closingPatientRef,
  formatWorkingNotesForClosing,
  hasUsefulClosingContext,
  selectPersistedTranscriptText,
  shouldAttachTranscriptToClosing,
} from "@/features/sessions/ai/closing-context";

const VALID_CLOSING = {
  dpepDraft: {
    demanda: "Ansiedade no trabalho",
    procedimentos: "Escuta e psicoeducação",
    evolucao: "Relatou alívio parcial",
    plano: "Retomar respiração",
  },
  separateClinicalWorkingNoteCandidates: [],
  clinicalHypotheses: [],
  followUpPoints: [],
  itemsRequiringClinicianConfirmation: [],
  safety: {
    severity: "none" as const,
    domains: [],
    explicitSignals: [],
    missingInformation: [],
  },
  uncertainties: [],
};

describe("rascunho DPEP a partir da IA", () => {
  it("aceita DPEP válido no contrato de encerramento", () => {
    const draft = extractDpepDraft(VALID_CLOSING);
    expect(draft).toEqual({
      demand: "Ansiedade no trabalho",
      procedures: "Escuta e psicoeducação",
      evolution: "Relatou alívio parcial",
      plan: "Retomar respiração",
    });
  });

  it("rejeita resposta inválida sem inventar campos", () => {
    expect(extractDpepDraft(null)).toBeNull();
    expect(extractDpepDraft("not json")).toBeNull();
    expect(extractDpepDraft({ hello: "world" })).toBeNull();
    expect(extractDpepDraft({ dpepDraft: { demanda: "" } })).toBeNull();
  });

  it("recupera os quatro campos mesmo com propriedades extras ausentes", () => {
    const draft = extractDpepDraft({
      dpepDraft: {
        demanda: "Tema da sessão",
        procedimentos: "",
        evolucao: "",
        plano: "",
      },
    });
    expect(draft?.demand).toBe("Tema da sessão");
    expect(coerceSessionClosingOutput({ dpepDraft: { demanda: "Tema da sessão" } })?.safety.severity).toBe(
      "none",
    );
  });

  it("não pede confirmação quando os campos estão vazios", () => {
    expect(shouldConfirmDpepReplace(emptyDpepFields())).toBe(false);
    expect(dpepFieldsHaveContent(emptyDpepFields())).toBe(false);
  });

  it("pede confirmação quando já há conteúdo digitado", () => {
    expect(
      shouldConfirmDpepReplace({
        demand: "Já escrito",
        procedures: "",
        evolution: "",
        plan: "",
      }),
    ).toBe(true);
  });
});

describe("contexto de encerramento", () => {
  it("ignora transcrição não finalizada", () => {
    expect(
      selectPersistedTranscriptText([
        { text: "ainda processando", is_final: false },
        { text: "falou de trabalho", is_final: true },
      ]),
    ).toBe("falou de trabalho");
  });

  it("trata contexto vazio sem chamar o modelo", () => {
    expect(hasUsefulClosingContext("", "")).toBe(false);
    expect(hasUsefulClosingContext("  ", "")).toBe(false);
    expect(hasUsefulClosingContext("", "nota clínica")).toBe(true);
  });

  it("combina anotações persistidas", () => {
    expect(
      formatWorkingNotesForClosing({
        formulation: "Formulação breve",
        hypotheses: null,
        working_observations: "Observação",
      }),
    ).toContain("Formulação breve");
  });

  it("não anexa transcrição sem consentimento de transcrição", () => {
    expect(shouldAttachTranscriptToClosing(false)).toBe(false);
    expect(shouldAttachTranscriptToClosing(true)).toBe(true);
  });

  it("não identifica o paciente no rótulo enviado ao modelo", () => {
    expect(closingPatientRef().displayLabel).toBe("Paciente da sessão");
  });
});

describe("erros de Session AI", () => {
  it("classifica timeout, 429 e 500", () => {
    expect(classifySessionAiError(new GeminiTimeoutError())).toBe("timeout");
    expect(classifySessionAiError(new GeminiApiError("rate", 429))).toBe("rate_limited");
    expect(classifySessionAiError(new GeminiApiError("down", 500))).toBe("provider_unavailable");
    expect(classifySessionAiError(new GeminiApiError("Gemini response was not valid JSON", 200))).toBe(
      "invalid_output",
    );
  });

  it("não deixa exceção escapar da action", async () => {
    const result = await catchSessionAiFailure("session_closing", async () => {
      throw new GeminiApiError("down", 500);
    });
    expect(result.error).toBe(SESSION_AI_USER_ERROR);
    expect(result.content).toBeUndefined();
  });

  it("propaga NEXT_REDIRECT", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    expect(isNextControlFlowError(redirectError)).toBe(true);
    await expect(
      catchSessionAiFailure("session_closing", async () => {
        throw redirectError;
      }),
    ).rejects.toBe(redirectError);
  });

  it("mensagem de contexto vazio é local e estável", () => {
    expect(SESSION_AI_EMPTY_CONTEXT_MESSAGE).toMatch(/conteúdo suficiente/i);
    expect(SESSION_AI_USER_ERROR).not.toMatch(/Gemini|Zod|Supabase|HTTP|429|API key/i);
  });
});

describe("consentimento de transcrição por modo", () => {
  it("live exige transcrição; closing e preparation não", () => {
    expect(sessionAiRequiresTranscriptionConsent("session_live")).toBe(true);
    expect(sessionAiRequiresTranscriptionConsent("session_closing")).toBe(false);
    expect(sessionAiRequiresTranscriptionConsent("session_preparation")).toBe(false);
  });
});
