"use client";

import { BookOpen, FileText, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { deleteSourceAction, retryIngestionAction } from "@/features/knowledge/actions";
import {
  DOCUMENT_TYPE_LABELS,
  KNOWLEDGE_SOURCE_STATUS_LABELS,
  type KnowledgeSourceRow,
} from "@/features/knowledge/contracts";
import { cn } from "@/lib/utils/cn";

const STATUS_BADGE = {
  uploaded: "pending",
  processing: "pending",
  ready: "completed",
  failed: "failed",
} as const;

const TYPE_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "livro", label: "Livros", types: ["livro", "capitulo"] },
  { id: "artigo", label: "Artigos", types: ["artigo", "estudo", "revisao"] },
  { id: "manual", label: "Manuais", types: ["manual", "guideline", "protocolo", "guia", "consenso_posicionamento"] },
] as const;

function sourceLabel(source: KnowledgeSourceRow): string {
  return source.title ?? source.storage_path.split("/").pop() ?? source.id;
}

export function SourcesList({ sources }: { sources: KnowledgeSourceRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["id"]>("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const active = TYPE_FILTERS.find((item) => item.id === typeFilter);
    return sources.filter((source) => {
      if (active && active.id !== "all" && "types" in active) {
        if (!source.document_type || !active.types.includes(source.document_type)) {
          return false;
        }
      }
      if (!query) {
        return true;
      }
      const haystack = [
        sourceLabel(source),
        source.authors.join(" "),
        source.document_type ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [search, sources, typeFilter]);

  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma fonte enviada ainda.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Pesquisar fontes…"
      />
      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTypeFilter(item.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              typeFilter === item.id
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-surface",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma fonte nesta busca.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((source) => {
            const typeLabel = source.document_type
              ? DOCUMENT_TYPE_LABELS[
                  source.document_type as keyof typeof DOCUMENT_TYPE_LABELS
                ]
              : null;
            const Icon = source.document_type === "livro" ? BookOpen : FileText;
            return (
              <div
                key={source.id}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-surface/40 px-3 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage-light/40 text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">
                        {sourceLabel(source)}
                      </span>
                      {source.authors.length > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          {source.authors.join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <StatusBadge
                    status={STATUS_BADGE[source.status]}
                    label={KNOWLEDGE_SOURCE_STATUS_LABELS[source.status]}
                    pulse={source.status === "processing"}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {typeLabel ? (
                      <span className="mr-2 rounded-full bg-card px-2 py-0.5 font-semibold uppercase tracking-wide">
                        {typeLabel}
                      </span>
                    ) : null}
                    {new Date(source.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="flex items-center gap-1">
                    {source.status === "failed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        isLoading={isPending}
                        aria-label="Tentar processar de novo"
                        onClick={() =>
                          startTransition(async () => {
                            await retryIngestionAction(source.id);
                            router.refresh();
                          })
                        }
                      >
                        <RotateCw className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      aria-label="Remover fonte"
                      isLoading={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await deleteSourceAction(source.id);
                          router.refresh();
                        })
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
