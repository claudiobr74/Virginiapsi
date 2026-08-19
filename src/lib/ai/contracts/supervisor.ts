const SUPPORT_LEVEL = ["ALTA", "MODERADA", "BAIXA", "INSUFICIENTE"] as const;

export const SUPERVISOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "directAnswer",
    "clinicalSynthesis",
    "goalsPreferencesAndContext",
    "relevantData",
    "hypotheses",
    "cbtFormulation",
    "schemaTherapyFormulation",
    "additionalFrameworks",
    "therapeuticProcess",
    "possibleBlindSpots",
    "prioritizedInterventions",
    "suggestedQuestions",
    "nextSessionPlan",
    "competenceAndSupervision",
    "riskAndEthics",
    "limitations"
  ],
  properties: {
    directAnswer: { type: "string" },
    clinicalSynthesis: { type: "string" },
    goalsPreferencesAndContext: {
      type: "object",
      additionalProperties: false,
      required: ["goals", "preferences", "strengths", "contextualFactors"],
      properties: {
        goals: { type: "array", items: { type: "string" } },
        preferences: { type: "array", items: { type: "string" } },
        strengths: { type: "array", items: { type: "string" } },
        contextualFactors: { type: "array", items: { type: "string" } }
      }
    },
    relevantData: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidenceType", "sourceRef"],
        properties: {
          text: { type: "string" },
          evidenceType: {
            type: "string",
            enum: [
              "DADO_DOCUMENTADO",
              "RELATO_PACIENTE",
              "NOTA_CLINICA",
              "FATO_FONTE",
              "SINTESE"
            ]
          },
          sourceRef: { type: ["string", "null"] }
        }
      }
    },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "hypothesis",
          "supportingEvidence",
          "contradictoryEvidence",
          "alternatives",
          "supportLevel",
          "howToTest"
        ],
        properties: {
          hypothesis: { type: "string" },
          supportingEvidence: { type: "array", items: { type: "string" } },
          contradictoryEvidence: { type: "array", items: { type: "string" } },
          alternatives: { type: "array", items: { type: "string" } },
          supportLevel: { type: "string", enum: SUPPORT_LEVEL },
          howToTest: { type: "array", items: { type: "string" } }
        }
      }
    },
    cbtFormulation: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "maintenanceCycles", "resources", "uncertainties"],
      properties: {
        summary: { type: "string" },
        maintenanceCycles: { type: "array", items: { type: "string" } },
        resources: { type: "array", items: { type: "string" } },
        uncertainties: { type: "array", items: { type: "string" } }
      }
    },
    schemaTherapyFormulation: {
      type: "object",
      additionalProperties: false,
      required: [
        "summary",
        "possibleSchemas",
        "possibleModes",
        "copingStyles",
        "needs",
        "healthyResources",
        "uncertainties"
      ],
      properties: {
        summary: { type: "string" },
        possibleSchemas: { type: "array", items: { type: "string" } },
        possibleModes: { type: "array", items: { type: "string" } },
        copingStyles: { type: "array", items: { type: "string" } },
        needs: { type: "array", items: { type: "string" } },
        healthyResources: { type: "array", items: { type: "string" } },
        uncertainties: { type: "array", items: { type: "string" } }
      }
    },
    additionalFrameworks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["framework", "contribution", "supportLevel", "cautions"],
        properties: {
          framework: { type: "string" },
          contribution: { type: "string" },
          supportLevel: { type: "string", enum: SUPPORT_LEVEL },
          cautions: { type: "array", items: { type: "string" } }
        }
      }
    },
    therapeuticProcess: {
      type: "object",
      additionalProperties: false,
      required: [
        "observations",
        "possibleRuptures",
        "repairsOrStrengths",
        "therapistFactors",
        "boundaries",
        "uncertainties"
      ],
      properties: {
        observations: { type: "array", items: { type: "string" } },
        possibleRuptures: { type: "array", items: { type: "string" } },
        repairsOrStrengths: { type: "array", items: { type: "string" } },
        therapistFactors: { type: "array", items: { type: "string" } },
        boundaries: { type: "array", items: { type: "string" } },
        uncertainties: { type: "array", items: { type: "string" } }
      }
    },
    possibleBlindSpots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["possibility", "basis", "alternativeExplanation", "howToCheck"],
        properties: {
          possibility: { type: "string" },
          basis: { type: "array", items: { type: "string" } },
          alternativeExplanation: { type: "array", items: { type: "string" } },
          howToCheck: { type: "array", items: { type: "string" } }
        }
      }
    },
    prioritizedInterventions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "priority",
          "option",
          "goal",
          "rationale",
          "prerequisites",
          "timingConsiderations",
          "competenceConsiderations",
          "cautions",
          "signalsToReassess"
        ],
        properties: {
          priority: { type: "integer", minimum: 1 },
          option: { type: "string" },
          goal: { type: "string" },
          rationale: { type: "string" },
          prerequisites: { type: "array", items: { type: "string" } },
          timingConsiderations: { type: "array", items: { type: "string" } },
          competenceConsiderations: { type: "array", items: { type: "string" } },
          cautions: { type: "array", items: { type: "string" } },
          signalsToReassess: { type: "array", items: { type: "string" } }
        }
      }
    },
    suggestedQuestions: {
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
    nextSessionPlan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["step", "goal", "flexibilityNote"],
        properties: {
          step: { type: "string" },
          goal: { type: "string" },
          flexibilityNote: { type: "string" }
        }
      }
    },
    competenceAndSupervision: {
      type: "object",
      additionalProperties: false,
      required: ["competenceFlags", "humanSupervisionRecommended", "reasons", "referralConsiderations"],
      properties: {
        competenceFlags: { type: "array", items: { type: "string" } },
        humanSupervisionRecommended: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" } },
        referralConsiderations: { type: "array", items: { type: "string" } }
      }
    },
    riskAndEthics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issue", "severity", "basis", "missingInformation", "clinicianReview"],
        properties: {
          issue: { type: "string" },
          severity: {
            type: "string",
            enum: ["none", "attention", "urgent_review"]
          },
          basis: { type: "array", items: { type: "string" } },
          missingInformation: { type: "array", items: { type: "string" } },
          clinicianReview: { type: "string" }
        }
      }
    },
    limitations: { type: "array", items: { type: "string" } }
  }
} as const;
