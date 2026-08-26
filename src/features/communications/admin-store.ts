import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role access for WhatsApp jobs and Twilio webhooks. pg_net and
 * Twilio do not send a user session, so these paths cannot use the cookie
 * client. Callers must authenticate (CRON_SECRET or Twilio signature)
 * before invoking anything here.
 */
export function communicationsAdmin() {
  return createSupabaseAdminClient();
}
