import "server-only";

import { redirect } from "next/navigation";
import {
  membershipRowSchema,
  organizationRowSchema,
  shellSettingsRowSchema,
  type Membership,
  type OrganizationRole,
  type ShellSettings,
} from "@/features/organizations/contracts";
import { isMissingPublicTable } from "@/lib/supabase/postgrest-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lists the memberships of the authenticated user. Reads go through the
 * user's own session, so RLS — not this query — is what limits the rows.
 */
export async function acceptPendingInvitations(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("accept_pending_invitations");
}

export async function listActiveMemberships(): Promise<Membership[]> {
  const supabase = await createSupabaseServerClient();

  const { data: memberRows, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id, role, active")
    .eq("active", true);

  if (memberError) {
    if (isMissingPublicTable(memberError)) {
      redirect("/setup-required");
    }
    throw new Error(`failed to load memberships: ${memberError.message}`);
  }

  const memberships = membershipRowSchema.array().parse(memberRows ?? []);
  if (memberships.length === 0) {
    return [];
  }

  const { data: orgRows, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug, timezone, status")
    .in(
      "id",
      memberships.map((membership) => membership.organization_id),
    );

  if (orgError) {
    throw new Error(`failed to load organizations: ${orgError.message}`);
  }

  const organizations = organizationRowSchema.array().parse(orgRows ?? []);
  const organizationsById = new Map(
    organizations.map((organization) => [organization.id, organization]),
  );

  return memberships
    .map((membership) => {
      const organization = organizationsById.get(membership.organization_id);
      if (!organization || organization.status !== "active") {
        return null;
      }
      return {
        organizationId: organization.id,
        organizationName: organization.name,
        slug: organization.slug,
        timezone: organization.timezone,
        role: membership.role,
      } satisfies Membership;
    })
    .filter((membership): membership is Membership => membership !== null)
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName, "pt-BR"));
}

/**
 * Minimized settings projection every active member may read. The
 * practice_settings table itself stays admin-only in RLS, so secretaries
 * never receive administrative or financial settings.
 */
export async function getPlatformBootstrapState(): Promise<{
  isOperator: boolean;
  operatorsExist: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_bootstrap_state");
  if (error) {
    return { isOperator: false, operatorsExist: true };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    isOperator: Boolean(row?.is_operator),
    operatorsExist: Boolean(row?.operators_exist),
  };
}

export async function listAssignablePsychologists(organizationId: string): Promise<
  { userId: string; role: OrganizationRole; email: string | null }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_assignable_psychologists", {
    p_org_id: organizationId,
  });
  if (error || !data) {
    return [];
  }
  return (data as { user_id: string; role: OrganizationRole; email: string | null }[]).map(
    (row) => ({
      userId: row.user_id,
      role: row.role,
      email: row.email,
    }),
  );
}

export async function getShellSettings(
  organizationId: string,
): Promise<ShellSettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("organization_shell_settings", {
    org_id: organizationId,
  });

  if (error) {
    return null;
  }

  const rows = shellSettingsRowSchema.array().safeParse(data ?? []);
  if (!rows.success) {
    return null;
  }
  return rows.data[0] ?? null;
}
