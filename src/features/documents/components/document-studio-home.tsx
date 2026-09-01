"use client";

import { FilePlus2, FileText, Search, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToneIcon } from "@/components/ui/tone-icon";
import { TemplatesPanel } from "@/features/documents/components/templates-panel";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentRow,
  type DocumentTemplateRow,
} from "@/features/documents/contracts";
import { documentStatusTone } from "@/features/documents/status-presentation";
import {
  searchSystemTemplates,
  TEMPLATE_CATEGORY_LABELS,
  type SystemTemplateCategory,
  type SystemTemplateDefinition,
} from "@/features/documents/system-templates";
import { toggleTemplateFavoriteAction } from "@/features/documents/studio-actions";
import { cn } from "@/lib/utils/cn";

const CATEGORY_ORDER: SystemTemplateCategory[] = [
  "declaracoes",
  "atestados",
  "relatorios",
  "avaliacao",
  "pareceres",
  "encaminhamentos",
  "contratos",
  "termos",
  "administrativos",
];

export function DocumentStudioHome({
  documents,
  patientNames,
  templates,
  favorites,
  isAdmin,
}: {
  documents: DocumentRow[];
  patientNames: Record<string, string>;
  templates: DocumentTemplateRow[];
  favorites: string[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [favoriteKeys, setFavoriteKeys] = useState(favorites);

  const matches = useMemo(() => searchSystemTemplates(search), [search]);
  const favoriteTemplates = matches.filter((template) => favoriteKeys.includes(template.key));
  const recent = documents.slice(0, 8);

  function toggleFavorite(key: string) {
    setFavoriteKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
    startTransition(async () => {
      await toggleTemplateFavoriteAction(key);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Card tone="documents" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Produza documentos profissionais com a identidade da clínica — para pacientes, escolas,
            médicos, operadoras e instituições.
          </p>
        </div>
        <Link
          href="/app/documents/new"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <FilePlus2 className="size-4" aria-hidden />
          Novo documento
        </Link>
      </Card>

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Buscar documento… relatório para psiquiatra, escola, contrato, menor"
        className="max-w-xl"
      />

      {favoriteTemplates.length > 0 ? (
        <section>
          <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">Favoritos</h2>
          <div className="flex flex-wrap gap-2">
            {favoriteTemplates.map((template) => (
              <Link
                key={template.key}
                href={`/app/documents/new?template=${template.key}`}
                className="rounded-full border border-primary/30 bg-sage-light/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary"
              >
                {template.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">
          Modelos profissionais
        </h2>
        <div className="flex flex-col gap-6">
          {CATEGORY_ORDER.map((category) => {
            const items = matches.filter((template) => template.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {TEMPLATE_CATEGORY_LABELS[category]}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((template) => (
                    <TemplateCard
                      key={template.key}
                      template={template}
                      favorite={favoriteKeys.includes(template.key)}
                      onFavorite={() => toggleFavorite(template.key)}
                      pending={isPending}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <Card headed tone="documents" title="Meus modelos">
        {isAdmin ? (
          <TemplatesPanel templates={templates} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Modelos da clínica são gerenciados pela psicóloga administradora.
          </p>
        )}
      </Card>

      <Card headed tone="documents" title="Documentos recentes">
        {recent.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum documento ainda"
            description="Comece por um modelo profissional ou crie a partir do prontuário."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((document) => (
              <Link
                key={document.id}
                href={`/app/documents/${document.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm hover:border-primary/30"
              >
                <div className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{document.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {DOCUMENT_KIND_LABELS[document.document_kind]}
                    <span className="mx-1.5">·</span>
                    {document.patient_id
                      ? (patientNames[document.patient_id] ?? "Paciente")
                      : "Sem paciente"}
                  </span>
                </div>
                <StatusBadge
                  status={documentStatusTone(document.status)}
                  label={DOCUMENT_STATUS_LABELS[document.status]}
                />
              </Link>
            ))}
          </div>
        )}
        {documents.length > 8 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            <Search className="mr-1 inline size-3" aria-hidden />
            {documents.length} documentos no arquivo. Use a busca acima para modelos; a lista completa
            permanece nos recentes e no prontuário.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function TemplateCard({
  template,
  favorite,
  onFavorite,
  pending,
}: {
  template: SystemTemplateDefinition;
  favorite: boolean;
  onFavorite: () => void;
  pending: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-[20px] border border-tone-documents-border bg-card shadow-card">
      <div className="flex items-start justify-between gap-2 border-b border-tone-documents-border bg-tone-documents px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <ToneIcon tone="documents">
            <FileText />
          </ToneIcon>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{template.name}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={favorite ? "Remover dos favoritos" : "Favoritar"}
          disabled={pending}
          onClick={onFavorite}
          className="rounded-full p-1 text-muted-foreground hover:text-primary"
        >
          <Star className={cn("size-4", favorite && "fill-primary text-primary")} />
        </button>
      </div>
      <div className="flex flex-col gap-3 bg-card px-4 py-3">
        <p className="text-[11px] text-muted-foreground">
          {template.intendedRecipients.slice(0, 3).join(" · ")}
        </p>
        <Link
          href={`/app/documents/new?template=${template.key}`}
          className="text-xs font-semibold text-primary hover:text-primary-hover"
        >
          Usar este modelo
        </Link>
      </div>
    </article>
  );
}
