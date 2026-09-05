import { FilePlus2, FileText } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentStudioHome } from "@/features/documents/components/document-studio-home";
import { listTemplateFavorites } from "@/features/documents/branding-queries";
import { listDocuments } from "@/features/documents/queries";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Documentos — VirgíniaPsi" };

export default async function DocumentsPage() {
  const { organizationId, role, user } = await requireOrgContext();

  const [documents, patients, favorites] = await Promise.all([
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
        title="Documentos"
        subtitle="Escolher, escrever e finalizar"
        actions={
          <Link
            href="/app/documents/new"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <FilePlus2 className="size-4" aria-hidden />
            Novo documento
          </Link>
        }
      />
      <DocumentStudioHome
        documents={documents}
        patientNames={patientNames}
        favorites={favorites}
        isAdmin={role === "psychologist_admin"}
      />
    </PageContainer>
  );
}
