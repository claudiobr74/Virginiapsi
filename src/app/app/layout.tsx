import { AppShell } from "@/features/shell/app-shell";
import { ROLE_LABELS } from "@/features/organizations/labels";
import { getShellSettings } from "@/features/organizations/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const dynamic = "force-dynamic";

function displayNameFromEmail(email: string | undefined) {
  const localPart = email?.split("@")[0] ?? "Profissional";
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { user, organizationId, organizationName, role, memberships } =
    await requireOrgContext();
  const settings = await getShellSettings(organizationId);

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  const professionalName =
    settings?.professional_name?.trim() ||
    metadataName ||
    displayNameFromEmail(user.email ?? undefined);

  return (
    <AppShell
      userEmail={user.email ?? ""}
      professionalName={professionalName}
      professionalSubtitle={user.email ?? ""}
      organizationName={settings?.organization_name ?? organizationName}
      roleLabel={ROLE_LABELS[role]}
      canSwitchOrganization={memberships.length > 1}
      inactivityTimeoutMinutes={settings?.inactivity_timeout_minutes}
    >
      {children}
    </AppShell>
  );
}
