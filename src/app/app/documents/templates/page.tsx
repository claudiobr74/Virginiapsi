import { Files } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { TemplatesPanel } from "@/features/documents/components/templates-panel";
import { listTemplates } from "@/features/documents/queries";
import { RestrictedAccess } from "@/features/shell/restricted-access";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Modelos — VirgíniaPsi" };

export default async function DocumentTemplatesPage() {
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return <RestrictedAccess sectionLabel="os modelos da clínica" />;
  }
  const templates = await listTemplates(organizationId);
  return (
    <PageContainer>
      <PageHeader
        icon={Files}
        title="Gerenciar modelos"
        subtitle="Modelos personalizados da clínica"
      />
      <TemplatesPanel templates={templates} />
    </PageContainer>
  );
}
