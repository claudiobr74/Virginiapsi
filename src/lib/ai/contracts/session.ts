const SUPPORT_LEVEL = ["ALTA", "MODERADA", "BAIXA", "INSUFICIENTE"] as const;
const SAFETY_SEVERITY = ["none", "attention", "urgent_review"] as const;
const SAFETY_DOMAIN = [
  "SELF_HARM_SUICIDE",
  "VIOLENCE_TO_OTHERS",
  "ABUSE_SAFEGUARDING",
  "ACUTE_MENTAL_STATE_CHANGE",
  "SUBSTANCE_RELATED",
  "EATING_DISORDER_MEDICAL_RISK",
  "OTHER"
] as const;

export const SESSION_LIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summarySoFar",
    "observations",
    "hypotheses",
    "suggestedQuestions",
    "possibleInterventions",
    "contextualConsiderations",
    "safety",
    "criticalDataGaps",
    "uncertainties"
  ],
  properties: {
    summarySoFar: { type: "string" },
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceType"],
        properties: {
          text: { type: "string" },
          evidenceType: {
            type: "string",
            enum: ["DADO_DOCUMENTADO", "RELATO_PACIENTE", "NOTA_CLINICA", "SINTESE"]
          }
        }
      }
    },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "supportLevel", "basis", "alternatives"],
        properties: {
          text: { type: "string" },
          supportLevel: { type: "string", enum: SUPPORT_LEVEL },
          basis: { type: "array", items: { type: "string" } },
          alternatives: { type: "array", items: { type: "string" } }
        }
      }
    },
    suggestedQuestions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "purpose", "caution"],
        properties: {
          question: { type: "string" },
          purpose: { type: "string" },
          caution: { type: ["string", "null"] }
        }
      }
    },
    possibleInterventions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["option", "rationale", "prerequisites", "cautions"],
        properties: {
          option: { type: "string" },
          rationale: { type: "string" },
          prerequisites: { type: "array", items: { type: "string" } },
          cautions: { type: "array", items: { type: "string" } }
        }
      }
    },
    contextualConsiderations: { type: "array", items: { type: "string" } },
    safety: {
      type: "object",
      additionalProperties: false,
      required: ["severity", "domains", "explicitSignals", "missingInformation", "clinicianReview"],
      properties: {
        severity: { type: "string", enum: SAFETY_SEVERITY },
        domains: { type: "array", items: { type: "string", enum: SAFETY_DOMAIN } },
        explicitSignals: { type: "array", items: { type: "string" } },
        missingInformation: { type: "array", items: { type: "string" } },
        clinicianReview: { type: ["string", "null"] }
      }
    },
    criticalDataGaps: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } }
  }
} as const;

export const SESSION_PREPARATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "continuitySummary",
    "goalsAndPreferences",
    "openLoops",
    "patternsToRevisit",
    "priorInterventionResponse",
    "homeworkReview",
    "therapeuticProcess",
    "contextualFactors",
    "suggestedAgenda",
    "questions",
    "hypothesesToTest",
    "safetyMonitoring",
    "dataGaps"
  ],
  properties: {
    continuitySummary: { type: "string" },
    goalsAndPreferences: { type: "array", items: { type: "string" } },
    openLoops: { type: "array", items: { type: "string" } },
    patternsToRevisit: { type: "array", items: { type: "string" } },
    priorInterventionResponse: { type: "array", items: { type: "string" } },
    homeworkReview: { type: "array", items: { type: "string" } },
    therapeuticProcess: { type: "array", items: { type: "string" } },
    contextualFactors: { type: "array", items: { type: "string" } },
    suggestedAgenda: { type: "array", maxItems: 5, items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "purpose", "caution"],
        properties: {
          question: { type: "string" },
          purpose: { type: "string" },
          caution: { type: ["string", "null"] }
        }
      }
    },
    hypothesesToTest: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hypothesis", "supportLevel", "alternatives", "howToCheck"],
        properties: {
          hypothesis: { type: "string" },
          supportLevel: { type: "string", enum: SUPPORT_LEVEL },
          alternatives: { type: "array", items: { type: "string" } },
          howToCheck: { type: "array", items: { type: "string" } }
        }
      }
    },
    safetyMonitoring: { type: "array", items: { type: "string" } },
    dataGaps: { type: "array", items: { type: "string" } }
  }
} as const;

export const SESSION_CLOSING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "dpepDraft",
    "separateClinicalWorkingNoteCandidates",
    "clinicalHypotheses",
    "followUpPoints",
    "itemsRequiringClinicianConfirmation",
    "safety",
    "uncertainties"
  ],
  properties: {
    dpepDraft: {
      type: "object",
      additionalProperties: false,
      required: ["demanda", "procedimentos", "evolucao", "plano"],
      properties: {
        demanda: { type: "string" },
        procedimentos: { type: "string" },
        evolucao: { type: "string" },
        plano: { type: "string" }
      }
    },
    separateClinicalWorkingNoteCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "reason", "storageCaution"],
        properties: {
          text: { type: "string" },
          reason: { type: "string" },
          storageCaution: { type: "string" }
        }
      }
    },
    clinicalHypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hypothesis", "supportLevel", "basis", "alternatives"],
        properties: {
          hypothesis: { type: "string" },
          supportLevel: { type: "string", enum: SUPPORT_LEVEL },
          basis: { type: "array", items: { type: "string" } },
          alternatives: { type: "array", items: { type: "string" } }
        }
      }
    },
    followUpPoints: { type: "array", items: { type: "string" } },
    itemsRequiringClinicianConfirmation: { type: "array", items: { type: "string" } },
    safety: {
      type: "object",
      additionalProperties: false,
      required: ["severity", "domains", "explicitSignals", "missingInformation"],
      properties: {
        severity: { type: "string", enum: SAFETY_SEVERITY },
        domains: { type: "array", items: { type: "string", enum: SAFETY_DOMAIN } },
        explicitSignals: { type: "array", items: { type: "string" } },
        missingInformation: { type: "array", items: { type: "string" } }
      }
    },
    uncertainties: { type: "array", items: { type: "string" } }
  }
} as const;
