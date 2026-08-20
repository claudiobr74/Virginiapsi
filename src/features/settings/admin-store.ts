import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role access for the audio-retention job and for minting signed
 * export download URLs. The tesseli-exports and session-audio-fallback
 * buckets have zero GRANTs for anon/authenticated — callers must authenticate
 * (CRON_SECRET or psychologist_admin) before invoking anything here.
 */
export function settingsAdmin() {
  return createSupabaseAdminClient();
}

export const EXPORT_BUCKET = "tesseli-exports";
export const FALLBACK_AUDIO_BUCKET = "session-audio-fallback";
