import "server-only";

import { redirect } from "next/navigation";
import { resolveActiveMembership } from "@/features/organizations/active-organization";
import type { Membership, OrganizationRole } from "@/features/organizations/contracts";
import { listActiveMemberships } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth/require-user";
import type { User } from "@supabase/supabase-js";

export interface OrgContext {
  user: User;
  organizationId: string;
  organizationName: string;
  timezone: string;
  role: OrganizationRole;
  memberships: Membership[];
}

/**
 * Server-side guard for tenant-scoped routes: authenticates the user through
 * the real Supabase session, loads their memberships under RLS and resolves
 * the active organization. Returning a role here is for UI shaping only — the
 * database policies remain the authorization boundary for every query.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const user = await requireUser();
  const memberships = await listActiveMemberships();

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const { membership, requiresSelection } =
    await resolveActiveMembership(memberships);

  if (!membership) {
    if (requiresSelection) {
      redirect("/select-organization");
    }
    redirect("/onboarding");
  }

  return {
    user,
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    timezone: membership.timezone,
    role: membership.role,
    memberships,
  };
}

export function isPsychologistAdmin(role: OrganizationRole): boolean {
  return role === "psychologist_admin";
}
