export const KNOWLEDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "directAnswer",
    "evidenceStatus",
    "synthesis",
    "centralClaims",
    "citations",
    "sourceAppraisal",
    "convergences",
    "disagreements",
    "clinicalApplicability",
    "limitations",
    "nextQuestions"
  ],
  properties: {
    directAnswer: { type: "string" },
    evidenceStatus: {
      type: "string",
      enum: ["SUFICIENTE", "PARCIAL", "INSUFICIENTE", "CONFLITANTE"]
    },
    synthesis: { type: "string" },
    centralClaims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "claimType", "sourceIds"],
        properties: {
          claim: { type: "string" },
          claimType: {
            type: "string",
            enum: ["FATO_FONTE", "SINTESE", "INTERPRETACAO"]
          },
          sourceIds: { type: "array", items: { type: "string" } }
        }
      }
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "title", "location", "supportedClaim"],
        properties: {
          sourceId: { type: "string" },
          title: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          supportedClaim: { type: "string" }
        }
      }
    },
    sourceAppraisal: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "sourceRole", "roleInAnswer", "appraisalLimits"],
        properties: {
          sourceId: { type: "string" },
          sourceRole: {
            type: "string",
            enum: [
              "GUIDELINE",
              "SYSTEMATIC_REVIEW_META_ANALYSIS",
              "PRIMARY_STUDY",
              "TEXTBOOK_CHAPTER",
              "THEORETICAL_CONCEPTUAL",
              "CONSENSUS_POSITION",
              "EDUCATIONAL",
              "OTHER",
              "UNKNOWN"
            ]
          },
          roleInAnswer: { type: "string" },
          appraisalLimits: { type: "array", items: { type: "string" } }
        }
      }
    },
    convergences: { type: "array", items: { type: "string" } },
    disagreements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "positions"],
        properties: {
          topic: { type: "string" },
          positions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["position", "sourceIds"],
              properties: {
                position: { type: "string" },
                sourceIds: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    },
    clinicalApplicability: {
      type: "object",
      additionalProperties: false,
      required: [
        "enabled",
        "text",
        "inferences",
        "contextFit",
        "competenceConsiderations",
        "cautions"
      ],
      properties: {
        enabled: { type: "boolean" },
        text: { type: ["string", "null"] },
        inferences: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["inference", "caseBasis", "sourceBasis", "supportLevel"],
            properties: {
              inference: { type: "string" },
              caseBasis: { type: "array", items: { type: "string" } },
              sourceBasis: { type: "array", items: { type: "string" } },
              supportLevel: {
                type: "string",
                enum: ["ALTA", "MODERADA", "BAIXA", "INSUFICIENTE"]
              }
            }
          }
        },
        contextFit: { type: "array", items: { type: "string" } },
        competenceConsiderations: { type: "array", items: { type: "string" } },
        cautions: { type: "array", items: { type: "string" } }
      }
    },
    limitations: { type: "array", items: { type: "string" } },
    nextQuestions: { type: "array", items: { type: "string" } }
  }
} as const;

export const KNOWLEDGE_INGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "authors",
    "year",
    "edition",
    "documentType",
    "studyDesignOrSourceRole",
    "language",
    "theoreticalApproaches",
    "populationContext",
    "mainTopics",
    "systemTags"
  ],
  properties: {
    title: { type: ["string", "null"] },
    authors: { type: "array", items: { type: "string" } },
    year: { type: ["integer", "null"] },
    edition: { type: ["string", "null"] },
    documentType: { type: ["string", "null"] },
    studyDesignOrSourceRole: { type: ["string", "null"] },
    language: { type: ["string", "null"] },
    theoreticalApproaches: { type: "array", items: { type: "string" } },
    populationContext: { type: "array", items: { type: "string" } },
    mainTopics: { type: "array", items: { type: "string" } },
    systemTags: { type: "array", items: { type: "string" } }
  }
} as const;
