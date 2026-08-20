import { FileText } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentKind,
  type DocumentStatus,
} from "@/features/documents/contracts";
import type { RecentDocumentItem } from "@/features/dashboard/contracts";

const STATUS_BADGE = {
  draft: "pending",
  issued: "completed",
  signed: "completed",
  canceled: "cancelled",
} as const;

export function RecentDocumentsPanel({ documents }: { documents: RecentDocumentItem[] }) {
  return (
    <section aria-labelledby="recent-documents-heading" className="flex flex-col gap-3">
      <SectionHeader
        id="recent-documents-heading"
        title="Documentos recentes"
        actions={
          <Link
            href="/app/documents"
            className="text-sm font-semibold text-primary hover:underline"
          >
            Ver todos
          </Link>
        }
      />
      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento recente"
          description="Laudos, atestados e recibos emitidos a partir do Prontuário aparecem aqui."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/app/documents/${document.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-surface"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">{document.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {DOCUMENT_KIND_LABELS[document.documentKind as DocumentKind] ??
                      document.documentKind}
                  </span>
                </div>
                <StatusBadge
                  status={STATUS_BADGE[document.status]}
                  label={DOCUMENT_STATUS_LABELS[document.status as DocumentStatus]}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
