import "server-only";

import { parseGoogleCalendarEnv, parseServerEnv } from "@/lib/env/server-schema";
import type { GoogleCalendarEnv, ServerEnv } from "@/lib/env/server-schema";

export * from "@/lib/env/server-schema";

export function getServerEnv(): ServerEnv {
  return parseServerEnv();
}

export function getGoogleCalendarEnv(): GoogleCalendarEnv {
  return parseGoogleCalendarEnv();
}
