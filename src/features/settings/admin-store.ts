import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role access for the audio-retention job, signed export download
 * URLs, and D1 B Auth invites. The tesseli-exports and session-audio-fallback
 * buckets have zero GRANTs for anon/authenticated — callers must authenticate
 * (CRON_SECRET or psychologist_admin) before invoking anything here.
 */
export function settingsAdmin() {
  return createSupabaseAdminClient();
}

/** D1 B: cria o usuário Auth se o e-mail ainda não existir. Falha fechada se o service-role não estiver configurado. */
export async function inviteAuthUserByEmail(email: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.auth.admin.inviteUserByEmail(email);
}

export const EXPORT_BUCKET = "tesseli-exports";
export const FALLBACK_AUDIO_BUCKET = "session-audio-fallback";
