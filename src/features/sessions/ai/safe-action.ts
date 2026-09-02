import type { SessionAiActionResult } from "@/features/sessions/ai/action-result";
import { newSessionAiCorrelationId } from "@/features/sessions/ai/correlation";
import type { SessionAiPurpose } from "@/features/sessions/ai/purpose";
import {
  classifySessionAiError,
  isNextControlFlowError,
  publicMessageForSessionAiError,
} from "@/features/sessions/ai/session-ai-errors";
import { logSessionAiStage } from "@/features/sessions/ai/session-ai-log";
import { GeminiApiError } from "@/lib/integrations/gemini/client";

export interface SessionAiTrace {
  correlationId: string;
  started: number;
}

export async function catchSessionAiFailure(
  purpose: SessionAiPurpose,
  run: (trace: SessionAiTrace) => Promise<SessionAiActionResult>,
): Promise<SessionAiActionResult> {
  const correlationId = newSessionAiCorrelationId();
  const started = Date.now();
  logSessionAiStage({
    event: "session_ai_started",
    correlationId,
    purpose,
    durationMs: 0,
  });
  try {
    const result = await run({ correlationId, started });
    return { ...result, correlationId: result.correlationId ?? correlationId };
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    const errorKind = classifySessionAiError(error);
    logSessionAiStage({
      event: "session_ai_failed",
      correlationId,
      purpose,
      stage: errorKind === "env" ? "env" : "unknown",
      errorKind,
      providerStatus: error instanceof GeminiApiError ? error.status : undefined,
      providerCode: error instanceof GeminiApiError ? error.providerCode : undefined,
      durationMs: Date.now() - started,
    });
    return {
      error: publicMessageForSessionAiError(purpose, errorKind),
      correlationId,
    };
  }
}
