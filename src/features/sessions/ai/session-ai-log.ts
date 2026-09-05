import type { SessionAiErrorKind } from "@/features/sessions/ai/session-ai-errors";
import type { SessionAiPurpose } from "@/features/sessions/ai/purpose";

export type SessionAiLogEvent =
  | "session_ai_started"
  | "session_ai_authorized"
  | "session_ai_context_ready"
  | "session_ai_env_ready"
  | "session_ai_run_insert_started"
  | "session_ai_run_insert_succeeded"
  | "session_ai_gemini_started"
  | "session_ai_gemini_succeeded"
  | "session_ai_artifact_persisted"
  | "session_ai_failed";

export type SessionAiStage =
  | "authorize"
  | "context"
  | "env"
  | "ai_run_insert"
  | "gemini"
  | "artifact"
  | "unknown";

export interface SessionAiLogPayload {
  event: SessionAiLogEvent;
  correlationId: string;
  purpose: SessionAiPurpose;
  stage?: SessionAiStage;
  errorKind?: SessionAiErrorKind;
  dbCode?: string;
  constraint?: string;
  providerStatus?: number;
  providerCode?: string;
  model?: string;
  durationMs: number;
  missingEnvKeys?: string[];
}

const BLOCKED_KEYS = new Set([
  "userContent",
  "systemInstruction",
  "prompt",
  "transcript",
  "dpep",
  "apiKey",
  "GEMINI_API_KEY",
  "cookies",
  "cookie",
  "accessToken",
  "refreshToken",
  "clinicianNotes",
  "workingNotes",
  "patientName",
]);

function sanitizeLogValue(key: string, value: unknown): unknown {
  if (BLOCKED_KEYS.has(key)) {
    return undefined;
  }
  if (key === "missingEnvKeys" && Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .map((item) => item.slice(0, 64));
  }
  if (typeof value === "string") {
    return value.slice(0, 128);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  return undefined;
}

/**
 * Sanitized Session AI telemetry.
 * Never log transcripts, DPEP, notes, patient names, prompt bodies,
 * cookies, tokens or secret values.
 */
export function logSessionAiStage(event: SessionAiLogPayload): void {
  const raw: Record<string, unknown> = {
    event: event.event,
    correlationId: event.correlationId,
    purpose: event.purpose,
    stage: event.stage ?? null,
    errorKind: event.errorKind ?? null,
    dbCode: event.dbCode ?? null,
    constraint: event.constraint ?? null,
    providerStatus: event.providerStatus ?? null,
    providerCode: event.providerCode ?? null,
    model: event.model ?? null,
    durationMs: event.durationMs,
    missingEnvKeys: event.missingEnvKeys ?? null,
  };

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const next = sanitizeLogValue(key, value);
    if (next !== undefined) {
      sanitized[key] = next;
    }
  }

  console.info("[session-ai]", JSON.stringify(sanitized));
}
