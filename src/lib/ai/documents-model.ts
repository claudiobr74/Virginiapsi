export const DEFAULT_GEMINI_DOCUMENT_MODEL = "gemini-3.6-flash";

/** Centralized document-studio model. Optional env override; never hardcode in UI. */
export function geminiDocumentsModel(env?: { GEMINI_MODEL_DOCUMENTS?: string | undefined }): string {
  const fromEnv = env?.GEMINI_MODEL_DOCUMENTS?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_GEMINI_DOCUMENT_MODEL;
}
