import { Download } from "lucide-react";
import Link from "next/link";
import { DashboardWidget } from "@/features/dashboard/components/dashboard-widget";
import type { RecentDocumentItem } from "@/features/dashboard/contracts";
import {
  DOCUMENT_KIND_LABELS,
  type DocumentKind,
} from "@/features/documents/contracts";

export function RecentDocumentsPanel({ documents }: { documents: RecentDocumentItem[] }) {
  return (
    <DashboardWidget
      id="recent-documents-heading"
      title="Documentos Gerados"
      actions={
        <Link href="/app/documents" className="text-sm font-semibold text-primary hover:underline">
          Ver todos
        </Link>
      }
      empty={documents.length === 0}
      emptyLabel="Nenhum documento gerado hoje."
    >
      <ul className="flex flex-col gap-2">
        {documents.map((document) => (
          <li key={document.id}>
            <Link
              href={`/app/documents/${document.id}`}
              className="flex items-center justify-between gap-3 rounded-xl py-1 text-sm transition-colors hover:bg-surface"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-foreground">{document.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {DOCUMENT_KIND_LABELS[document.documentKind as DocumentKind] ??
                    document.documentKind}
                </span>
              </div>
              <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </DashboardWidget>
  );
}
