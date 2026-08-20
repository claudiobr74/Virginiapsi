import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuditEventInput {
  organizationId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  /** Keep this minimized: never clinical content, tokens or transcripts. */
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Writes an audit event through the database function, which forces
 * `actor_user_id = auth.uid()` and requires an active membership. Direct
 * INSERT into audit_events is not granted to any application role, so the
 * trail cannot be forged with another actor or organization.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("log_audit_event", {
    org_id: input.organizationId,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    // Audit failures must be visible in logs, but never leak payload content.
    throw new Error(`failed to write audit event ${input.action}`);
  }
}
