import { FilePlus2 } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { NewDocumentWizard } from "@/features/documents/components/new-document-wizard";
import { SYSTEM_TEMPLATE_CATEGORIES, type SystemTemplateCategory } from "@/features/documents/system-templates";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Novo documento — VirgíniaPsi" };

function isCategory(value: string | undefined): value is SystemTemplateCategory {
  return Boolean(value && (SYSTEM_TEMPLATE_CATEGORIES as readonly string[]).includes(value));
}

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; category?: string }>;
}) {
  const { organizationId } = await requireOrgContext();
  const { template, category } = await searchParams;
  const patients = await listPatients(organizationId);

  return (
    <PageContainer>
      <PageHeader
        icon={FilePlus2}
        title="Novo documento"
        subtitle="Escolha o modelo e os dados necessários"
      />
      <NewDocumentWizard
        initialTemplateKey={template}
        initialCategory={isCategory(category) ? category : undefined}
        patients={patients.map((patient) => ({
          id: patient.id,
          preferred_name: patient.preferred_name,
          full_name: patient.full_name,
        }))}
      />
    </PageContainer>
  );
}
