import { Sun } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { MyDayBoard } from "@/features/dashboard/components/my-day-board";
import { getMyDaySnapshot } from "@/features/dashboard/queries";
import { getShellSettings } from "@/features/organizations/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Meu Dia — Tesseli" };

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
      <PageHeader
        icon={Sun}
        title="Meu Dia"
        subtitle={snapshot.greeting.quote ?? undefined}
      />
      <p className="font-serif text-lg italic text-foreground sm:text-xl">
        {snapshot.greeting.prefix}, {snapshot.greeting.professionalName}
      </p>
      <MyDayBoard snapshot={snapshot} />
    </PageContainer>
  );
}
