import { FileText } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentStudioHome } from "@/features/documents/components/document-studio-home";
import { listTemplateFavorites } from "@/features/documents/branding-queries";
import { listDocuments, listTemplates } from "@/features/documents/queries";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Estúdio de Documentos — VirgíniaPsi" };

export default async function DocumentsPage() {
  const { organizationId, role, user } = await requireOrgContext();

  const [templates, documents, patients, favorites] = await Promise.all([
    listTemplates(organizationId),
    listDocuments(organizationId),
    listPatients(organizationId),
    listTemplateFavorites(organizationId, user.id).catch(() => []),
  ]);
  const patientNames = Object.fromEntries(
    patients.map((patient) => [patient.id, patient.preferred_name]),
  );

  return (
    <PageContainer>
      <PageHeader
        icon={FileText}
        title="Estúdio de Documentos"
        subtitle="Produza documentos profissionais com sua identidade"
      />
      <DocumentStudioHome
        documents={documents}
        patientNames={patientNames}
        templates={templates}
        favorites={favorites}
        isAdmin={role === "psychologist_admin"}
      />
    </PageContainer>
  );
}
