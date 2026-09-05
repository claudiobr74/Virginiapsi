"use client";

import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
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

  const stats = useMemo(() => {
    const ready = sources.filter((source) => source.status === "ready").length;
    const processing = sources.filter(
      (source) => source.status === "processing" || source.status === "uploaded",
    ).length;
    const failed = sources.filter((source) => source.status === "failed").length;
    return { total: sources.length, ready, processing, failed };
  }, [sources]);

  return (
    <PageContainer>
      <PageHeader
        icon={BookOpen}
        title="Conhecimento"
        subtitle="Acervo teórico privado, rastreável e library-only por padrão"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total de fontes" value={String(stats.total)} hint="Disponíveis neste consultório" />
        <StatCard label="Prontas" value={String(stats.ready)} hint="Indexadas para consulta" />
        <StatCard
          label="Em processamento"
          value={String(stats.processing)}
          hint="Upload ou extração em curso"
        />
        <StatCard label="Com falha" value={String(stats.failed)} hint="Dá para tentar de novo" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(16rem,380px)_1fr]">
        <section className="flex flex-col gap-6">
          <Card headed tone="knowledge" title="Biblioteca de fontes" description="Coleções temáticas e arquivos do consultório — nunca dados de paciente.">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Coleções
            </h3>
            <CollectionsPanel
              collections={collections}
              selectedCollectionIds={selectedCollectionIds}
              onToggle={toggleCollection}
            />
          </Card>
          <Card headed tone="knowledge" title="Fontes">
            <SourceUploadForm collectionId={selectedCollectionIds[0]} />
            <div className="mt-4">
              <SourcesList sources={sources} />
            </div>
          </Card>
        </section>

        <Card tone="knowledge" className="sm:p-6">
          <KnowledgeModesPanel
            selectedCollectionIds={selectedCollectionIds}
            sources={sources}
            patients={patients}
          />
        </Card>
      </div>
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[20px] border border-tone-knowledge-border bg-tone-knowledge p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold italic text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
