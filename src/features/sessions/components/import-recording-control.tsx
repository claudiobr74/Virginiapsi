"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { IMPORT_AUDIO_MAX_BYTES } from "@/features/sessions/transcription/constants";
import { extensionFromFilename } from "@/lib/integrations/transcription/groq-audio";
import { cn } from "@/lib/utils/cn";
import type { ConfirmedTranscriptSegment } from "@/features/sessions/transcription/session-transcription-transport";

const ACCEPT = ".m4a,.mp4,.mp3,.wav,.webm,.ogg,.flac,audio/*";

export function ImportRecordingControl({
  sessionId,
  patientId,
  nextSequence,
  disabled,
  onImported,
}: {
  sessionId: string;
  patientId: string;
  nextSequence: number;
  disabled?: boolean;
  onImported: (segment: ConfirmedTranscriptSegment) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function importFile(file: File) {
    setError(null);
    setMessage(null);
    if (!extensionFromFilename(file.name) && !file.type.startsWith("audio/")) {
      setError("Este formato de arquivo não é suportado para importação.");
      return;
    }
    if (file.size > IMPORT_AUDIO_MAX_BYTES) {
      setError("Arquivo acima de 25 MB. Divida a gravação.");
      return;
    }

    setBusy(true);
    try {
      const grantResponse = await fetch("/api/session-capture/upload-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, sessionId, filename: file.name }),
      });
      if (!grantResponse.ok) {
        setError("Não foi possível autorizar a importação desta gravação.");
        return;
      }
      const grant = (await grantResponse.json()) as {
        grant: string;
        signedUrl: string;
        path: string;
        token: string;
      };
      const uploaded = await fetch(grant.signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });
      if (!uploaded.ok) {
        setError("O envio da gravação falhou. Tente novamente.");
        return;
      }

      const transcribeResponse = await fetch("/api/session-capture/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant: grant.grant,
          sessionId,
          patientId,
          storagePath: grant.path,
          sequence: nextSequence,
          startMs: 0,
          filename: file.name,
        }),
      });
      if (!transcribeResponse.ok) {
        setError("A transcrição da gravação importada falhou. O arquivo temporário permanece disponível.");
        return;
      }
      const body = (await transcribeResponse.json()) as {
        segment?: ConfirmedTranscriptSegment | null;
      };
      if (body.segment?.text) {
        onImported(body.segment);
      }
      setMessage("Gravação importada e transcrita.");
    } catch {
      setError("Não foi possível importar a gravação agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-2xl border border-dashed border-border bg-surface/30 px-3 py-3"
        aria-label="Importar gravação"
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled || busy) {
            return;
          }
          const file = event.dataTransfer.files[0];
          if (file) {
            void importFile(file);
          }
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label
            className={cn(
              buttonVariants({ variant: "secondary", size: "md" }),
              "min-h-11 min-w-44 cursor-pointer",
              (disabled || busy) && "pointer-events-none opacity-50",
            )}
          >
            {busy ? "Importando…" : "Importar gravação"}
            <input
              type="file"
              accept={ACCEPT}
              aria-label="Importar gravação"
              className="sr-only"
              disabled={disabled || busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void importFile(file);
                }
              }}
            />
          </label>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-failed">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
