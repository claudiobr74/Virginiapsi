import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { RestrictedAccess } from "@/features/shell/restricted-access";
import { OrganizationSessionsList } from "@/features/sessions/components/organization-sessions-list";
import { listOrganizationSessions } from "@/features/sessions/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("Sessões") };

export default async function SessionsPage() {
  const { organizationId, role, timezone } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return <RestrictedAccess sectionLabel="as Sessões clínicas" />;
  }

  const rows = await listOrganizationSessions(organizationId);

  return (
    <PageContainer>
      <h1 className="font-serif text-[28px] font-bold leading-tight text-foreground">Sessões</h1>
      <OrganizationSessionsList rows={rows} timezone={timezone} />
    </PageContainer>
  );
}
