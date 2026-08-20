"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { DocumentDownloadButton } from "@/features/documents/components/patient-documents-panel";
import {
  cancelDocumentAction,
  issueDocumentAction,
  saveDraftAction,
} from "@/features/documents/actions";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentRow,
  type DocumentVersionRow,
} from "@/features/documents/contracts";
import type { DocumentFileRow } from "@/features/documents/contracts";

const STATUS_BADGE = {
  draft: "pending",
  issued: "completed",
  signed: "completed",
  canceled: "cancelled",
} as const;

export function DocumentEditor({
  document,
  latestVersion,
  file,
  versions,
}: {
  document: DocumentRow;
  latestVersion: DocumentVersionRow | null;
  file: DocumentFileRow | null;
  versions: DocumentVersionRow[];
}) {
  const router = useRouter();
  const [body, setBody] = useState(latestVersion?.body_snapshot ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isDraft = document.status === "draft";

  function saveDraft() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await saveDraftAction({ documentId: document.id, body });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess("Rascunho salvo.");
      router.refresh();
    });
  }

  function issue() {
    setError(null);
    startTransition(async () => {
      const result = await issueDocumentAction(document.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      await cancelDocumentAction(document.id);
      setConfirmCancel(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5">
        <div>
          <h1 className="font-serif text-xl font-bold italic text-foreground">
            {document.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {DOCUMENT_KIND_LABELS[document.document_kind]} — {document.sensitivity === "clinical" ? "Clínico" : "Administrativo"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={STATUS_BADGE[document.status]}
            label={DOCUMENT_STATUS_LABELS[document.status]}
          />
          {document.status !== "canceled" ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmCancel(true)}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
          {success}
        </p>
      ) : null}

      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Canvas — use variáveis como {"{{patient.full_name}}"}, {"{{professional.name}}"}, {"{{date.today}}"}
          </span>
        </div>
        <textarea
          rows={18}
          disabled={!isDraft}
          className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 font-mono text-sm disabled:opacity-70"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        {isDraft ? (
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" isLoading={isPending} onClick={saveDraft}>
              Salvar rascunho
            </Button>
            <Button type="button" size="sm" isLoading={isPending} onClick={issue}>
              Emitir PDF
            </Button>
          </div>
        ) : file ? (
          <div className="mt-3 flex justify-end">
            <DocumentDownloadButton documentVersionId={file.document_version_id} />
          </div>
        ) : null}
      </div>

      {versions.length > 1 ? (
        <div className="rounded-3xl border border-border bg-card p-5">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Histórico de versões
          </span>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
            {versions.map((version) => (
              <li key={version.id}>
                Versão {version.version} — {new Date(version.created_at).toLocaleString("pt-BR")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar documento?"
        description="O documento fica marcado como cancelado e não pode mais ser editado ou reemitido. Para corrigir, crie um novo documento."
        confirmLabel="Cancelar documento"
        isLoading={isPending}
        onConfirm={cancel}
      />
    </div>
  );
}
