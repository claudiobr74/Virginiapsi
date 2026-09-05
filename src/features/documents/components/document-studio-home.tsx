"use client";

import { FilePlus2, FileText, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToneIcon } from "@/components/ui/tone-icon";
import { TemplateCatalog } from "@/features/documents/components/template-catalog";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentRow,
} from "@/features/documents/contracts";
import { documentStatusTone } from "@/features/documents/status-presentation";
import {
  HOME_SHORTCUTS,
  recentSystemTemplateKeys,
  shortcutHref,
} from "@/features/documents/studio-presentation";
import { toggleTemplateFavoriteAction } from "@/features/documents/studio-actions";
import { getSystemTemplate, searchSystemTemplates } from "@/features/documents/system-templates";

export function DocumentStudioHome({
  documents,
  patientNames,
  favorites,
  isAdmin,
}: {
  documents: DocumentRow[];
  patientNames: Record<string, string>;
  favorites: string[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [showAllDocuments, setShowAllDocuments] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [favoriteKeys, setFavoriteKeys] = useState(favorites);

  const searchMatches = useMemo(() => (search.trim() ? searchSystemTemplates(search) : []), [search]);
  const favoriteTemplates = favoriteKeys
    .map((key) => getSystemTemplate(key))
    .filter((template): template is NonNullable<typeof template> => Boolean(template));
  const recentTemplateKeys = recentSystemTemplateKeys(documents, 4);
  const recentDocuments = showAllDocuments ? documents : documents.slice(0, 5);

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
      <section>
        <h2 className="mb-3 font-serif text-lg font-bold italic text-foreground">O que você quer criar?</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {HOME_SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon;
            if (!shortcut.category) {
              return (
                <button
                  key={shortcut.id}
                  type="button"
                  onClick={() => setCatalogOpen(true)}
                  className="flex items-start gap-3 rounded-[20px] border border-tone-documents-border bg-card p-4 text-left shadow-card hover:shadow-card-hover"
                >
                  <ToneIcon tone="documents">
                    <Icon />
                  </ToneIcon>
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{shortcut.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{shortcut.description}</span>
                  </span>
                </button>
              );
            }
            return (
              <Link
                key={shortcut.id}
                href={shortcutHref(shortcut.category)}
                className="flex items-start gap-3 rounded-[20px] border border-tone-documents-border bg-card p-4 shadow-card hover:shadow-card-hover"
              >
                <ToneIcon tone="documents">
                  <Icon />
                </ToneIcon>
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{shortcut.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{shortcut.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Buscar um modelo..."
        className="max-w-xl"
      />

      {searchMatches.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Resultados</h2>
          <div className="flex flex-col gap-2">
            {searchMatches.slice(0, 8).map((template) => (
              <Link
                key={template.key}
                href={`/app/documents/new?template=${template.key}`}
                className="rounded-2xl border border-border bg-card px-4 py-3 text-sm hover:border-primary/30"
              >
                <span className="font-semibold text-foreground">{template.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{template.description}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {recentTemplateKeys.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Usados recentemente</h2>
          <div className="flex flex-wrap gap-2">
            {recentTemplateKeys.map((key) => {
              const template = getSystemTemplate(key);
              if (!template) return null;
              return (
                <Link
                  key={key}
                  href={`/app/documents/new?template=${key}`}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/30"
                >
                  {template.name}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {favoriteTemplates.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Star className="size-3.5 fill-primary text-primary" aria-hidden />
            Favoritos
          </h2>
          <div className="flex flex-wrap gap-2">
            {favoriteTemplates.map((template) => (
              <span
                key={template.key}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-sage-light/30 pl-3 pr-1 py-1 text-xs font-semibold text-foreground"
              >
                <Link href={`/app/documents/new?template=${template.key}`} className="hover:text-primary">
                  {template.name}
                </Link>
                <button
                  type="button"
                  aria-label={`Remover ${template.name} dos favoritos`}
                  disabled={isPending}
                  onClick={() => toggleFavorite(template.key)}
                  className="rounded-full p-1 text-primary hover:bg-card"
                >
                  <Star className="size-3 fill-primary" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <Card headed tone="documents" title="Documentos recentes">
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum documento ainda"
            action={
              <Button asChild size="sm">
                <Link href="/app/documents/new">
                  <FilePlus2 className="size-4" aria-hidden />
                  Criar primeiro documento
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {recentDocuments.map((document) => (
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
        {documents.length > 5 ? (
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-primary"
            onClick={() => setShowAllDocuments((current) => !current)}
          >
            {showAllDocuments ? "Mostrar menos" : "Ver todos"}
          </button>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setCatalogOpen(true)}>
          Ver todos os modelos
        </Button>
        {isAdmin ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/app/documents/templates">Gerenciar modelos</Link>
          </Button>
        ) : null}
      </div>

      <Drawer open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DrawerContent
          title="Todos os modelos"
          description="Busque, filtre por categoria e escolha um modelo profissional."
          tone="documents"
          className="sm:max-w-3xl"
        >
          <TemplateCatalog
            favoriteKeys={favoriteKeys}
            onFavorite={toggleFavorite}
            pending={isPending}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
