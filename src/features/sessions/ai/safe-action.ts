import type { SessionAiActionResult } from "@/features/sessions/ai/action-result";
import type { SessionAiPurpose } from "@/features/sessions/ai/purpose";
import {
  classifySessionAiError,
  isNextControlFlowError,
  publicMessageForSessionAiError,
} from "@/features/sessions/ai/session-ai-errors";
import { logSessionAiEvent } from "@/features/sessions/ai/session-ai-log";

export async function catchSessionAiFailure(
  purpose: SessionAiPurpose,
  run: () => Promise<SessionAiActionResult>,
  meta?: { sessionId?: string; organizationId?: string; model?: string },
): Promise<SessionAiActionResult> {
  const started = Date.now();
  try {
    return await run();
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    const errorKind = classifySessionAiError(error);
    logSessionAiEvent({
      outcome: "failed",
      purpose,
      errorKind,
      durationMs: Date.now() - started,
      provider: "gemini",
      model: meta?.model,
      sessionId: meta?.sessionId,
      organizationId: meta?.organizationId,
    });
    return { error: publicMessageForSessionAiError(purpose, errorKind) };
  }
}
