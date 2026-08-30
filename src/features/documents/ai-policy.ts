/**
 * Pure consent policy for Document Studio drafting (docs/14 §3).
 * `selectedContext` is intentionally unused: omitting chart import must
 * never skip the gate when the document is linked to a patient.
 */
export function documentStudioAiConsentRequired(patientId: string | null | undefined): boolean {
  return Boolean(patientId);
}

export function documentStudioAiMayCallProvider(input: {
  patientId: string | null | undefined;
  aiProcessingAllowed: boolean;
  selectedContext?: unknown;
}): { allowed: true } | { allowed: false; reason: "ai_processing_denied" } {
  void input.selectedContext;
  if (!documentStudioAiConsentRequired(input.patientId)) {
    return { allowed: true };
  }
  if (!input.aiProcessingAllowed) {
    return { allowed: false, reason: "ai_processing_denied" };
  }
  return { allowed: true };
}

export const DOCUMENT_STUDIO_AI_CONSENT_DENIED =
  "Consentimento de apoio de IA não está válido para este paciente.";
