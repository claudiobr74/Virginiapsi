import { FileText } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TemplatesPanel } from "@/features/documents/components/templates-panel";
import { listDocuments, listTemplates } from "@/features/documents/queries";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
} from "@/features/documents/contracts";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Documentos — Tesseli" };

const STATUS_BADGE = {
  draft: "pending",
  issued: "completed",
  signed: "completed",
  canceled: "cancelled",
} as const;

export default async function DocumentsPage() {
  const { organizationId, role } = await requireOrgContext();

  const [templates, documents] = await Promise.all([
    listTemplates(organizationId),
    listDocuments(organizationId),
  ]);

  return (
    <PageContainer>
      <PageHeader
        icon={FileText}
        title="Documentos"
        subtitle="Modelos, versões e PDFs — visibilidade por classificação administrativa/clínica"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {role === "psychologist_admin" ? (
          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">Modelos</h2>
            <TemplatesPanel templates={templates} />
          </section>
        ) : (
          <section className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Modelos são gerenciados pela psicóloga administradora.
          </section>
        )}

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">
            Todos os documentos
          </h2>
          {documents.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhum documento ainda" description="Crie um documento a partir do Prontuário de um paciente." />
          ) : (
            <div className="flex flex-col gap-2">
              {documents.map((document) => (
                <Link
                  key={document.id}
                  href={`/app/documents/${document.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/40 px-3 py-2 text-sm transition-colors hover:bg-surface"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{document.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {DOCUMENT_KIND_LABELS[document.document_kind]}
                    </span>
                  </div>
                  <StatusBadge
                    status={STATUS_BADGE[document.status]}
                    label={DOCUMENT_STATUS_LABELS[document.status]}
                  />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
