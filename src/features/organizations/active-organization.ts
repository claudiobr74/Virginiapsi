import "server-only";

import { cookies } from "next/headers";
import type { Membership } from "@/features/organizations/contracts";

export const ACTIVE_ORGANIZATION_COOKIE = "tesseli-active-organization";

/**
 * Resolves the active organization for the request.
 *
 * The cookie is navigation context only: it is always matched against the
 * memberships the database returned for the authenticated user, so a tampered
 * value can never widen access. Auto-selecting a single membership is a UX
 * convenience — authorization still comes from membership/RLS on every query,
 * never from a position in this list.
 */
export async function resolveActiveMembership(
  memberships: Membership[],
): Promise<{ membership: Membership | null; requiresSelection: boolean }> {
  if (memberships.length === 0) {
    return { membership: null, requiresSelection: false };
  }

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const requested = requestedId
    ? memberships.find((item) => item.organizationId === requestedId)
    : undefined;

  if (requested) {
    return { membership: requested, requiresSelection: false };
  }

  if (memberships.length === 1) {
    return { membership: memberships[0], requiresSelection: false };
  }

  // Multiple memberships and no valid selection yet: the user must choose.
  return { membership: null, requiresSelection: true };
}
