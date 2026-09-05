"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentRow,
} from "@/features/documents/contracts";
import { cn } from "@/lib/utils/cn";

import { documentStatusTone } from "@/features/documents/status-presentation";

type SensitivityFilter = "all" | "clinical" | "administrative";

export function DocumentsLibrary({
  documents,
  patientNames,
  templateCount,
}: {
  documents: DocumentRow[];
  patientNames: Record<string, string>;
  templateCount: number;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SensitivityFilter>("all");

  const clinicalCount = documents.filter((document) => document.sensitivity === "clinical").length;
  const administrativeCount = documents.filter(
    (document) => document.sensitivity === "administrative",
  ).length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((document) => {
      if (filter !== "all" && document.sensitivity !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const patientName = document.patient_id ? (patientNames[document.patient_id] ?? "") : "";
      const haystack = [
        document.title,
        DOCUMENT_KIND_LABELS[document.document_kind],
        DOCUMENT_STATUS_LABELS[document.status],
        patientName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [documents, filter, patientNames, search]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total" value={String(documents.length)} hint="Arquivados no consultório" />
        <SummaryCard label="Clínicos" value={String(clinicalCount)} hint="Laudos, atestados e relatórios" />
        <SummaryCard
          label="Administrativos"
          value={String(administrativeCount)}
          hint="Recibos, contratos e afins"
        />
        <SummaryCard label="Modelos" value={String(templateCount)} hint="Templates ativos" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar documentos…"
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Todos"],
              ["clinical", "Clínicos"],
              ["administrative", "Administrativos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                filter === id
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">Todos os documentos</h2>
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={documents.length === 0 ? "Nenhum documento ainda" : "Nenhum documento nesta busca"}
            description={
              documents.length === 0
                ? "Crie um documento a partir do Prontuário de um paciente."
                : "Ajuste a busca ou o filtro de classificação."
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((document) => (
              <Link
                key={document.id}
                href={`/app/documents/${document.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-3 text-sm transition-colors hover:border-primary/30 hover:bg-surface"
              >
                <div className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{document.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {DOCUMENT_KIND_LABELS[document.document_kind]}
                    <span className="mx-1.5">·</span>
                    {document.patient_id
                      ? (patientNames[document.patient_id] ?? "Paciente")
                      : "Sem paciente"}
                    <span className="mx-1.5">·</span>
                    {new Date(document.created_at).toLocaleDateString("pt-BR")}
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
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold italic text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
