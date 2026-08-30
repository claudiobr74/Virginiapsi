import { NextResponse } from "next/server";
import { getDocument, getLatestVersion } from "@/features/documents/queries";
import { renderDocumentStudioPdf } from "@/features/documents/render-studio-pdf";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { generateDocumentPdf } from "@/lib/documents/generate-pdf";
import type { DocumentSection } from "@/features/documents/contracts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  const { organizationId } = await requireOrgContext();
  const document = await getDocument(organizationId, documentId);
  if (!document) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  const version = await getLatestVersion(documentId);
  if (!version) {
    return new NextResponse("Sem versão", { status: 404 });
  }

  const sections = (version.sections_snapshot ?? []) as DocumentSection[];
  const bytes = document.system_template_key
    ? await renderDocumentStudioPdf({
        organizationId,
        document,
        version,
        sections:
          sections.length > 0
            ? sections
            : [
                {
                  id: "body",
                  type: "text",
                  title: "",
                  content: version.body_snapshot,
                  order: 0,
                  enabled: true,
                  pageBreakBefore: false,
                },
              ],
        includeManualSignature: document.status !== "draft",
      })
    : await generateDocumentPdf({
        title: document.title,
        body: version.body_snapshot,
      });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=preview.pdf",
      "Cache-Control": "no-store",
    },
  });
}
