import { Settings } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { GoogleOAuthResultBanner } from "@/features/calendar/components/google-oauth-result-banner";
import { ensureGoogleCalendarReady } from "@/features/calendar/ensure-calendar";
import { SettingsConsole } from "@/features/settings/components/settings-console";
import { getSettingsSnapshot } from "@/features/settings/queries";
import { RestrictedAccess } from "@/features/shell/restricted-access";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Configurações — VirgíniaPsi" };

const SETTINGS_TABS = [
  "profile",
  "clinic",
  "appearance",
  "security",
  "team",
  "integrations",
  "backup",
  "risk",
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number];

function parseSettingsTab(value: string | undefined): SettingsTab | undefined {
  return SETTINGS_TABS.find((tab) => tab === value);
}

export default async function SettingsPage({
  searchParams,
}: PageProps<"/app/settings">) {
  const { organizationId, organizationName, timezone, role, user } =
    await requireOrgContext();

  if (role !== "psychologist_admin") {
    return <RestrictedAccess sectionLabel="as Configurações" />;
  }

  const params = await searchParams;
  const googleStatus = typeof params.google === "string" ? params.google : undefined;
  const googleDetail =
    typeof params.google_detail === "string" ? params.google_detail : undefined;
  const requestedTab = parseSettingsTab(
    typeof params.tab === "string" ? params.tab : undefined,
  );
  const initialTab =
    googleStatus === "connected" || googleStatus === "error"
      ? "integrations"
      : requestedTab;

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

  let googleConnection = snapshot.googleConnection;
  try {
    googleConnection = await ensureGoogleCalendarReady(
      organizationId,
      googleConnection,
    );
  } catch {
    googleConnection = snapshot.googleConnection;
  }

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
      <GoogleOAuthResultBanner status={googleStatus} detail={googleDetail} />
      <SettingsConsole
        snapshot={snapshot}
        googleConnection={googleConnection}
        initialTab={initialTab}
      />
    </PageContainer>
  );
}
