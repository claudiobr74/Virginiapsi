"use client";

import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  deleteAttachmentAction,
  registerAttachmentAction,
  requestAttachmentDownloadUrlAction,
  requestAttachmentUploadUrlAction,
} from "@/features/documents/actions";
import type { PatientAttachmentRow } from "@/features/documents/contracts";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function PatientAttachmentsPanel({
  patientId,
  attachments,
  isAdmin,
}: {
  patientId: string;
  attachments: PatientAttachmentRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sensitivity, setSensitivity] = useState<"administrative" | "clinical">(
    "administrative",
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    startTransition(async () => {
      try {
        const grant = await requestAttachmentUploadUrlAction({
          patientId,
          sensitivity,
          filename: file.name,
        });
        if (grant.error || !grant.path || !grant.token) {
          setError(grant.error ?? "Não foi possível preparar o envio.");
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage
          .from("patient-attachments")
          .uploadToSignedUrl(grant.path, grant.token, file);
        if (uploadError) {
          throw uploadError;
        }

        const sha256 = await sha256Hex(file);
        const result = await registerAttachmentAction({
          patientId,
          sensitivity,
          title: file.name,
          storagePath: grant.path,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
          sha256,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Não foi possível enviar o anexo agora.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  async function download(attachmentId: string) {
    const result = await requestAttachmentDownloadUrlAction(attachmentId);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    }
  }

  function remove(attachmentId: string) {
    startTransition(async () => {
      await deleteAttachmentAction(attachmentId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum anexo ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-2 scroll-mt-24 rounded-xl border border-border bg-surface/40 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-semibold text-foreground">{attachment.title}</span>
                <StatusBadge
                  status={attachment.sensitivity === "clinical" ? "attention" : "info"}
                  label={attachment.sensitivity === "clinical" ? "Clínico" : "Administrativo"}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label="Baixar anexo"
                  onClick={() => void download(attachment.id)}
                >
                  <Download className="size-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  aria-label="Remover anexo"
                  isLoading={isPending}
                  onClick={() => remove(attachment.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isAdmin ? (
          <select
            className="rounded-xl border border-border bg-input px-3 py-2 text-sm"
            value={sensitivity}
            onChange={(event) =>
              setSensitivity(event.target.value as "administrative" | "clinical")
            }
          >
            <option value="administrative">Administrativo</option>
            <option value="clinical">Clínico</option>
          </select>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isLoading={isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          Enviar anexo
        </Button>
      </div>
      {error ? <p className="text-xs text-failed">{error}</p> : null}
    </div>
  );
}
