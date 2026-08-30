import { FilePlus2 } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { NewDocumentWizard } from "@/features/documents/components/new-document-wizard";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Novo documento — VirgíniaPsi" };

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { organizationId } = await requireOrgContext();
  const { template } = await searchParams;
  const patients = await listPatients(organizationId);

  return (
    <PageContainer>
      <PageHeader
        icon={FilePlus2}
        title="Estúdio de documentos"
        subtitle="Finalidade, modelo, destinatário e identidade visual"
      />
      <NewDocumentWizard
        initialTemplateKey={template}
        patients={patients.map((patient) => ({
          id: patient.id,
          preferred_name: patient.preferred_name,
          full_name: patient.full_name,
        }))}
      />
    </PageContainer>
  );
}
