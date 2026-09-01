import "server-only";

import {
  parseGoogleCalendarEnv,
  parseServerEnv,
  parseSessionCaptureEnv,
} from "@/lib/env/server-schema";
import type {
  GoogleCalendarEnv,
  ServerEnv,
  SessionCaptureEnv,
} from "@/lib/env/server-schema";

export * from "@/lib/env/server-schema";

export function getServerEnv(): ServerEnv {
  return parseServerEnv();
}

export function getGoogleCalendarEnv(): GoogleCalendarEnv {
  return parseGoogleCalendarEnv();
}

export function getSessionCaptureEnv(): SessionCaptureEnv {
  return parseSessionCaptureEnv();
}
