"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cancelDocumentAction,
  issueDocumentAction,
  saveDraftAction,
} from "@/features/documents/actions";
import { DocumentDownloadButton } from "@/features/documents/components/patient-documents-panel";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentFileRow,
  type DocumentRow,
  type DocumentVersionRow,
} from "@/features/documents/contracts";

const STATUS_BADGE = {
  draft: "pending",
  issued: "completed",
  signed: "completed",
  canceled: "cancelled",
} as const;

const VARIABLE_CHIPS = [
  { key: "patient.full_name", label: "Nome do paciente" },
  { key: "patient.preferred_name", label: "Nome preferencial" },
  { key: "patient.public_code", label: "Código PAC" },
  { key: "professional.name", label: "Profissional" },
  { key: "organization.name", label: "Consultório" },
  { key: "date.today", label: "Data de hoje" },
] as const;

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(latestVersion?.body_snapshot ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isDraft = document.status === "draft";

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const el = textareaRef.current;
    if (!el) {
      setBody((current) => `${current}${token}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div>
          <Link
            href="/app/documents"
            className="text-xs font-semibold text-primary hover:text-primary-hover"
          >
            Voltar aos documentos
          </Link>
          <h1 className="mt-1 font-serif text-xl font-bold italic text-foreground">
            {document.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {DOCUMENT_KIND_LABELS[document.document_kind]} —{" "}
            {document.sensitivity === "clinical" ? "Clínico" : "Administrativo"}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Canvas
            </span>
            {isDraft ? (
              <div className="flex flex-wrap gap-1.5">
                {VARIABLE_CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => insertVariable(chip.key)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:bg-sage-light/20"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <textarea
            ref={textareaRef}
            rows={18}
            disabled={!isDraft}
            className="min-h-80 w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm leading-6 disabled:opacity-70"
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
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Histórico de versões
            </span>
            {versions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Ainda sem versões salvas.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                {versions.map((version) => (
                  <li key={version.id} className="rounded-xl border border-border px-3 py-2">
                    <span className="block font-semibold text-foreground">Versão {version.version}</span>
                    <span className="font-mono text-[11px]">
                      {new Date(version.created_at).toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {file ? (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                PDF
              </span>
              <div className="mt-3">
                <DocumentDownloadButton documentVersionId={file.document_version_id} />
              </div>
            </div>
          ) : null}
        </aside>
      </div>

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
