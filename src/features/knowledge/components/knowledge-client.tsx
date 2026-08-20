"use client";

import { BookOpen } from "lucide-react";
import { useState } from "react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { CollectionsPanel } from "@/features/knowledge/components/collections-panel";
import { KnowledgeModesPanel } from "@/features/knowledge/components/knowledge-modes-panel";
import { SourceUploadForm } from "@/features/knowledge/components/source-upload-form";
import { SourcesList } from "@/features/knowledge/components/sources-list";
import type {
  KnowledgeCollectionRow,
  KnowledgeSourceRow,
} from "@/features/knowledge/contracts";

export function KnowledgeConsole({
  collections,
  sources,
  patients,
}: {
  collections: KnowledgeCollectionRow[];
  sources: KnowledgeSourceRow[];
  patients: { id: string; preferred_name: string }[];
}) {
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  function toggleCollection(id: string) {
    setSelectedCollectionIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  }

  return (
    <PageContainer>
      <PageHeader
        icon={BookOpen}
        title="Conhecimento Tesseli"
        subtitle="Acervo teórico privado, rastreável e library-only por padrão"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <section className="flex flex-col gap-6">
          <div className="rounded-3xl border border-border bg-card p-5">
            <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">Coleções</h2>
            <CollectionsPanel
              collections={collections}
              selectedCollectionIds={selectedCollectionIds}
              onToggle={toggleCollection}
            />
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">Fontes</h2>
            <SourceUploadForm collectionId={selectedCollectionIds[0]} />
            <div className="mt-3">
              <SourcesList sources={sources} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6">
          <KnowledgeModesPanel
            selectedCollectionIds={selectedCollectionIds}
            sources={sources}
            patients={patients}
          />
        </section>
      </div>
    </PageContainer>
  );
}
