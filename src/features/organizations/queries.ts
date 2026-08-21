import "server-only";

import { redirect } from "next/navigation";
import {
  membershipRowSchema,
  organizationRowSchema,
  shellSettingsRowSchema,
  type Membership,
  type ShellSettings,
} from "@/features/organizations/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isMissingPublicTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }
  return (
    error.code === "PGRST205" ||
    /schema cache/i.test(error.message) ||
    /could not find the table/i.test(error.message)
  );
}

/**
 * Lists the memberships of the authenticated user. Reads go through the
 * user's own session, so RLS — not this query — is what limits the rows.
 */
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
export async function getShellSettings(
  organizationId: string,
): Promise<ShellSettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("organization_shell_settings", {
    org_id: organizationId,
  });

  if (error) {
    throw new Error(`failed to load shell settings: ${error.message}`);
  }

  const rows = shellSettingsRowSchema.array().parse(data ?? []);
  return rows[0] ?? null;
}
