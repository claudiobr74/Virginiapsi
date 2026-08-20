import "server-only";

import { connectionRowSchema, type ConnectionRow } from "@/features/calendar/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getConnection(
  organizationId: string,
): Promise<ConnectionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load Google connection: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return connectionRowSchema.parse(data);
}
