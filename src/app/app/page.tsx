import { PageContainer } from "@/components/ui/page-container";
import { MyDayBoard } from "@/features/dashboard/components/my-day-board";
import { MyDayWelcome } from "@/features/dashboard/components/my-day-welcome";
import { getMyDaySnapshot } from "@/features/dashboard/queries";
import { getShellSettings } from "@/features/organizations/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { pageTitle } from "@/lib/brand";

export const metadata = { title: pageTitle("Início") };

function displayNameFromEmail(email: string | undefined) {
  const localPart = email?.split("@")[0] ?? "Profissional";
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function MyDayPage() {
  const { user, organizationId, timezone, role } = await requireOrgContext();
  const settings = await getShellSettings(organizationId);

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  const professionalName =
    settings?.professional_name?.trim() ||
    metadataName ||
    displayNameFromEmail(user.email ?? undefined);

  const snapshot = await getMyDaySnapshot({
    organizationId,
    timezone,
    professionalName,
    settings,
    role,
  });

  return (
    <PageContainer>
      <MyDayWelcome snapshot={snapshot} />
      <MyDayBoard snapshot={snapshot} />
    </PageContainer>
  );
}
