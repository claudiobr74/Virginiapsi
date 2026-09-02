import type { SessionAiErrorKind } from "@/features/sessions/ai/session-ai-errors";
import type { SessionAiPurpose } from "@/features/sessions/ai/purpose";

/**
 * Sanitized Session AI telemetry. Never log transcripts, DPEP, notes,
 * patient names, prompt bodies, audio or secrets.
 */
export function logSessionAiEvent(event: {
  outcome: "succeeded" | "failed" | "skipped";
  purpose: SessionAiPurpose;
  errorKind?: SessionAiErrorKind;
  durationMs: number;
  provider: "gemini";
  model?: string;
  aiRunId?: string;
  sessionId?: string;
  organizationId?: string;
}): void {
  console.info(
    "[session-ai]",
    JSON.stringify({
      outcome: event.outcome,
      purpose: event.purpose,
      errorKind: event.errorKind ?? null,
      durationMs: event.durationMs,
      provider: event.provider,
      model: event.model ?? null,
      aiRunId: event.aiRunId ?? null,
      sessionId: event.sessionId ?? null,
      organizationId: event.organizationId ?? null,
    }),
  );
}
