export type SessionAiPurpose = "session_live" | "session_preparation" | "session_closing";

/** Live assist consumes transcript; closing may draft from persisted notes alone. */
export function sessionAiRequiresTranscriptionConsent(purpose: SessionAiPurpose): boolean {
  return purpose === "session_live";
}
