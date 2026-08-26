import { FileText } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentsLibrary } from "@/features/documents/components/documents-library";
import { TemplatesPanel } from "@/features/documents/components/templates-panel";
import { listDocuments, listTemplates } from "@/features/documents/queries";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Centro de Documentos — VirgíniaPsi" };

export default async function DocumentsPage() {
  const { organizationId, role } = await requireOrgContext();

  const [templates, documents, patients] = await Promise.all([
    listTemplates(organizationId),
    listDocuments(organizationId),
    listPatients(organizationId),
  ]);
  const patientNames = Object.fromEntries(
    patients.map((patient) => [patient.id, patient.preferred_name]),
  );

  return (
    <PageContainer>
      <PageHeader
        icon={FileText}
        title="Centro de Documentos"
        subtitle="Modelos, versões e PDFs — visibilidade por classificação administrativa/clínica"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(16rem,320px)_1fr]">
        {role === "psychologist_admin" ? (
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">Modelos</h2>
            <TemplatesPanel templates={templates} />
          </section>
        ) : (
          <section className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            Modelos são gerenciados pela psicóloga administradora.
          </section>
        )}

        <DocumentsLibrary
          documents={documents}
          patientNames={patientNames}
          templateCount={templates.length}
        />
      </div>
    </PageContainer>
  );
}
