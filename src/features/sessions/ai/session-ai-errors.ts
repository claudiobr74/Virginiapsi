import { GeminiApiError, GeminiTimeoutError } from "@/lib/integrations/gemini/client";
import {
  SESSION_AI_EMPTY_CONTEXT_MESSAGE,
  SESSION_AI_LIVE_USER_ERROR,
  SESSION_AI_USER_ERROR,
} from "@/features/sessions/ai/messages";
import type { SessionAiPurpose } from "@/features/sessions/ai/purpose";

export type SessionAiErrorKind =
  | "empty_context"
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "invalid_output"
  | "env"
  | "auth"
  | "unknown";

export function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const digest =
    "digest" in error && typeof (error as { digest?: unknown }).digest === "string"
      ? (error as { digest: string }).digest
      : "";
  return digest.includes("NEXT_REDIRECT") || digest.includes("NEXT_NOT_FOUND");
}

export function classifySessionAiError(error: unknown): SessionAiErrorKind {
  if (error instanceof GeminiTimeoutError) {
    return "timeout";
  }
  if (error instanceof GeminiApiError) {
    if (error.status === 429) {
      return "rate_limited";
    }
    if (error.status === 408) {
      return "timeout";
    }
    if (error.status === 401 || error.status === 403) {
      return "auth";
    }
    if (error.message.includes("not valid JSON") || error.message.includes("no text part")) {
      return "invalid_output";
    }
    if (error.status >= 500 || error.status === 404) {
      return "provider_unavailable";
    }
    return "provider_unavailable";
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "timeout";
    }
    if (/Invalid environment configuration/i.test(error.message)) {
      return "env";
    }
    if (error.name === "ZodError") {
      return "invalid_output";
    }
  }
  return "unknown";
}

export function publicMessageForSessionAiError(
  purpose: SessionAiPurpose,
  kind?: SessionAiErrorKind,
): string {
  if (kind === "empty_context") {
    return SESSION_AI_EMPTY_CONTEXT_MESSAGE;
  }
  if (purpose === "session_closing") {
    return SESSION_AI_USER_ERROR;
  }
  return SESSION_AI_LIVE_USER_ERROR;
}
