import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { DocumentEditor } from "@/features/documents/components/document-editor";
import { StudioEditor } from "@/features/documents/components/studio-editor";
import {
  getDocument,
  getFileForVersion,
  listDocumentDeliveries,
  listVersions,
} from "@/features/documents/queries";
import { getPatient } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export async function generateMetadata({
  params,
}: PageProps<"/app/documents/[documentId]">) {
  const { documentId } = await params;
  const { organizationId } = await requireOrgContext();
  const document = await getDocument(organizationId, documentId);
  return { title: document ? `${document.title} — VirgíniaPsi` : "Documento — VirgíniaPsi" };
}

export default async function DocumentDetailPage({
  params,
}: PageProps<"/app/documents/[documentId]">) {
  const { documentId } = await params;
  const { organizationId, role } = await requireOrgContext();

  const document = await getDocument(organizationId, documentId);
  if (!document) {
    notFound();
  }

  const versions = await listVersions(documentId);
  const latestVersion = versions[0] ?? null;
  const file = latestVersion ? await getFileForVersion(latestVersion.id) : null;
  const deliveries = await listDocumentDeliveries(documentId).catch(() => []);
  const patient = document.patient_id
    ? await getPatient(organizationId, document.patient_id)
    : null;

  return (
    <PageContainer>
      {document.system_template_key ? (
        <StudioEditor
          document={document}
          latestVersion={latestVersion}
          file={file}
          versions={versions}
          deliveries={deliveries}
          patientName={patient?.preferred_name ?? patient?.full_name ?? null}
          canSaveTemplate={role === "psychologist_admin"}
        />
      ) : (
        <DocumentEditor
          document={document}
          latestVersion={latestVersion}
          file={file}
          versions={versions}
        />
      )}
    </PageContainer>
  );
}
