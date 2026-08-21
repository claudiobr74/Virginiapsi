import "server-only";

import { getConnection } from "@/features/calendar/connection-queries";
import type { ConnectionRow } from "@/features/calendar/contracts";
import { syncGoogleCalendarPull } from "@/features/calendar/sync-actions";
import { selectPrimaryGoogleCalendar } from "@/lib/integrations/google/connection";

/**
 * After OAuth, tokens exist but no calendar_id yet. Pick the primary
 * calendar and pull the next 30 days so the Agenda is not empty.
 * Failures stay silent: the operator can still choose a calendar in the UI.
 */
export async function ensureGoogleCalendarReady(
  organizationId: string,
  connection: ConnectionRow | null,
): Promise<ConnectionRow | null> {
  if (connection?.status !== "connected" || connection.calendar_id) {
    return connection;
  }

  try {
    const selected = await selectPrimaryGoogleCalendar(organizationId);
    if (!selected) {
      return connection;
    }
    await syncGoogleCalendarPull(organizationId);
    return (await getConnection(organizationId)) ?? connection;
  } catch {
    return connection;
  }
}
