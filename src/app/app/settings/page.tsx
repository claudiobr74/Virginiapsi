import { Settings } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsConsole } from "@/features/settings/components/settings-console";
import { getSettingsSnapshot } from "@/features/settings/queries";
import { RestrictedAccess } from "@/features/shell/restricted-access";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Configurações — VirgíniaPsi" };

export default async function SettingsPage() {
  const { organizationId, organizationName, timezone, role, user } =
    await requireOrgContext();

  if (role !== "psychologist_admin") {
    return <RestrictedAccess sectionLabel="as Configurações" />;
  }

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  const snapshot = await getSettingsSnapshot({
    organizationId,
    organizationName,
    timezone,
    email: user.email ?? "",
    fullName: metadataName || organizationName,
  });

  return (
    <PageContainer>
      <PageHeader
        icon={Settings}
        title="Configurações"
        subtitle="Perfil, consultório, segurança, integrações, backup e zona de risco"
        actions={
          <span className="rounded-lg bg-sage-light/40 px-3 py-1.5 text-sm font-semibold text-primary">
            {organizationName}
          </span>
        }
      />
      <SettingsConsole snapshot={snapshot} />
    </PageContainer>
  );
}
