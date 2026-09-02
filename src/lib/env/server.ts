import "server-only";

import {
  parseGoogleCalendarEnv,
  parseGroqTranscriptionEnv,
  parseServerEnv,
  parseSessionAiEnv,
  parseSessionCaptureEnv,
  parseSupabaseAdminEnv,
} from "@/lib/env/server-schema";
import type {
  GoogleCalendarEnv,
  GroqTranscriptionEnv,
  ServerEnv,
  SessionAiEnv,
  SessionCaptureEnv,
  SupabaseAdminEnv,
} from "@/lib/env/server-schema";

export * from "@/lib/env/server-schema";

export function getServerEnv(): ServerEnv {
  return parseServerEnv();
}

export function getGoogleCalendarEnv(): GoogleCalendarEnv {
  return parseGoogleCalendarEnv();
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  return parseSupabaseAdminEnv();
}

export function getSessionCaptureEnv(): SessionCaptureEnv {
  return parseSessionCaptureEnv();
}

export function getGroqTranscriptionEnv(): GroqTranscriptionEnv {
  return parseGroqTranscriptionEnv();
}

export function getSessionAiEnv(): SessionAiEnv {
  return parseSessionAiEnv();
}
