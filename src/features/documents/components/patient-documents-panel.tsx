"use client";

import { Download, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createDocumentAction,
  requestDocumentDownloadUrlAction,
} from "@/features/documents/actions";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KIND_VALUES,
  DOCUMENT_STATUS_LABELS,
  FORCED_ADMINISTRATIVE_KINDS,
  FORCED_CLINICAL_KINDS,
  type DocumentKind,
  type DocumentRow,
  type DocumentTemplateRow,
} from "@/features/documents/contracts";

const STATUS_BADGE = {
  draft: "pending",
  issued: "completed",
  signed: "completed",
  canceled: "cancelled",
} as const;

export function PatientDocumentsPanel({
  patientId,
  documents,
  templates,
  isAdmin,
}: {
  patientId: string;
  documents: DocumentRow[];
  templates: DocumentTemplateRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [documentKind, setDocumentKind] = useState<DocumentKind>(
    isAdmin ? "atestado" : "recibo",
  );
  const [sensitivity, setSensitivity] = useState<"administrative" | "clinical">(
    isAdmin ? "clinical" : "administrative",
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const forced = FORCED_CLINICAL_KINDS.includes(documentKind)
    ? "clinical"
    : FORCED_ADMINISTRATIVE_KINDS.includes(documentKind)
      ? "administrative"
      : null;

  const availableKinds = isAdmin
    ? DOCUMENT_KIND_VALUES
    : DOCUMENT_KIND_VALUES.filter(
        (kind) => !FORCED_CLINICAL_KINDS.includes(kind as DocumentKind),
      );

  function submit() {
    setError(null);
    startTransition(async () => {
      const template = templates.find((candidate) => candidate.document_kind === documentKind);
      const result = await createDocumentAction({
        patientId,
        title,
        documentKind,
        sensitivity: forced ?? sensitivity,
        body: template?.body_template ?? "",
        templateId: template?.id ?? null,
      });
      if (result.error || !result.id) {
        setError(result.error ?? "Não foi possível criar o documento.");
        return;
      }
      router.push(`/app/documents/${result.id}`);
    });
  }

  async function download(document: DocumentRow) {
    // Downloads the latest issued version's file; the action resolves the
    // right document_version_id server-side.
    router.push(`/app/documents/${document.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum documento ainda"
          description="Crie laudos, atestados, recibos e outros documentos a partir daqui."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => void download(document)}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/40 px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
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
            </button>
          ))}
        </div>
      )}

      {creating ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <input
            placeholder="Título do documento"
            className="rounded-xl border border-border bg-input px-3.5 py-2.5 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <select
            className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
            value={documentKind}
            onChange={(event) => setDocumentKind(event.target.value as DocumentKind)}
          >
            {availableKinds.map((kind) => (
              <option key={kind} value={kind}>
                {DOCUMENT_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
          {!forced ? (
            <select
              className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
              value={sensitivity}
              onChange={(event) =>
                setSensitivity(event.target.value as "administrative" | "clinical")
              }
            >
              <option value="administrative">Administrativo</option>
              {isAdmin ? <option value="clinical">Clínico</option> : null}
            </select>
          ) : null}
          {error ? <p className="text-xs text-failed">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              isLoading={isPending}
              disabled={!title.trim()}
              onClick={submit}
            >
              Criar rascunho
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(true)}>
          <FileText className="size-4" aria-hidden />
          Novo documento
        </Button>
      )}
    </div>
  );
}

export function DocumentDownloadButton({ documentVersionId }: { documentVersionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    setError(null);
    startTransition(async () => {
      const result = await requestDocumentDownloadUrlAction(documentVersionId);
      if (result.error || !result.url) {
        setError(result.error ?? "Não foi possível gerar o link.");
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size="sm" variant="secondary" isLoading={isPending} onClick={download}>
        <Download className="size-4" aria-hidden />
        Baixar PDF
      </Button>
      {error ? <p className="text-xs text-failed">{error}</p> : null}
    </div>
  );
}
