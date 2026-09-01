import "server-only";

import {
  parseGoogleCalendarEnv,
  parseServerEnv,
  parseSessionCaptureEnv,
  parseSupabaseAdminEnv,
} from "@/lib/env/server-schema";
import type {
  GoogleCalendarEnv,
  ServerEnv,
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
