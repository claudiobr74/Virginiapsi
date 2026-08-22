import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { DocumentEditor } from "@/features/documents/components/document-editor";
import { getDocument, getFileForVersion, listVersions } from "@/features/documents/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export async function generateMetadata({
  params,
}: PageProps<"/app/documents/[documentId]">) {
  const { documentId } = await params;
  const { organizationId } = await requireOrgContext();
  const document = await getDocument(organizationId, documentId);
  return { title: document ? `${document.title} — Tesseli` : "Documento — Tesseli" };
}

export default async function DocumentDetailPage({
  params,
}: PageProps<"/app/documents/[documentId]">) {
  const { documentId } = await params;
  const { organizationId } = await requireOrgContext();

  const document = await getDocument(organizationId, documentId);
  if (!document) {
    notFound();
  }

  const versions = await listVersions(documentId);
  const latestVersion = versions[0] ?? null;
  const file = latestVersion ? await getFileForVersion(latestVersion.id) : null;

  return (
    <PageContainer>
      <DocumentEditor document={document} latestVersion={latestVersion} file={file} versions={versions} />
    </PageContainer>
  );
}
