export const DOCUMENT_STUDIO_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["draft", "reviewNotes", "needsHumanReview"],
  properties: {
    draft: { type: "string" },
    reviewNotes: { type: "array", items: { type: "string" } },
    needsHumanReview: { type: "boolean" },
  },
} as const;
