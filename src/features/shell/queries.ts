import "server-only";

import { getConnection } from "@/features/calendar/connection-queries";
import { listPendencies } from "@/features/dashboard/pendency-queries";
import type { OrganizationRole } from "@/features/organizations/contracts";

export async function getShellChrome(
  organizationId: string,
  role: OrganizationRole,
): Promise<{
  syncStatus: "connected" | "disconnected" | "error";
  pendingCount: number;
}> {
  const [connection, pendencies] = await Promise.all([
    getConnection(organizationId),
    listPendencies(organizationId, role),
  ]);

  return {
    syncStatus: connection?.status ?? "disconnected",
    pendingCount: pendencies.length,
  };
}
