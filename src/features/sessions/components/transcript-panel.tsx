"use client";

import { Mic, MicOff, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeStatus } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils/cn";
import type { TranscriptSegmentResult } from "@/features/sessions/transcription/use-local-transcription";
import { useLocalTranscription } from "@/features/sessions/transcription/use-local-transcription";
import type { TranscriptSegmentRow } from "@/features/sessions/contracts";

const STATE_LABEL: Record<string, { label: string; status: StatusBadgeStatus }> = {
  idle: { label: "Transcrição parada", status: "info" },
  preparing: { label: "Preparando…", status: "pending" },
  recording: { label: "Gravando (no dispositivo)", status: "active" },
  degraded: { label: "Transcrição indisponível neste dispositivo", status: "attention" },
  stopping: { label: "Parando…", status: "pending" },
  completed: { label: "Transcrição finalizada", status: "completed" },
  error: { label: "Erro na transcrição", status: "failed" },
};

export function TranscriptPanel({
  sessionId,
  patientId,
  initialSegments,
  disabled,
  feedClassName,
}: {
  sessionId: string;
  patientId: string;
  initialSegments: TranscriptSegmentRow[];
  disabled?: boolean;
  feedClassName?: string;
}) {
  const [segments, setSegments] = useState<TranscriptSegmentResult[]>(
    initialSegments.map((segment) => ({
      sequence: segment.sequence,
      text: segment.text,
      startMs: segment.start_ms ?? 0,
      endMs: segment.end_ms ?? 0,
      provider: segment.provider === "local-wasm" ? "local-wasm" : "local-webgpu",
    })),
  );

  const { state, errorMessage, model, downloadPercent, start, stop } = useLocalTranscription({
    sessionId,
    patientId,
    onSegment: (segment) => setSegments((prev) => [...prev, segment]),
  });

  const isRecording = state === "recording" || state === "preparing" || state === "stopping";
  const meta = STATE_LABEL[state] ?? STATE_LABEL.idle;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-3 py-3">
        <StatusBadge status={meta.status} label={meta.label} pulse={state === "recording"} />
        {isRecording ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={disabled || state === "preparing" || state === "stopping"}
            onClick={stop}
          >
            <MicOff className="size-4" aria-hidden />
            Parar transcrição
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => void start()}
          >
            <Mic className="size-4" aria-hidden />
            Iniciar transcrição
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Transcrição no dispositivo, por padrão. Nenhum áudio sai do computador — apenas o texto
        final é enviado para o prontuário
        {model ? ` (modelo local, WER aproximado ${model.approxWerLabel}).` : "."}
      </p>

      {downloadPercent !== null ? (
        <div className="flex flex-col gap-1" role="status">
          <span className="text-xs text-muted-foreground">
            Preparando transcrição local — baixando modelo ({downloadPercent}%)…
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {state === "degraded" ? (
        <p className="flex items-center gap-2 rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Este dispositivo não sustenta a transcrição local. A sessão segue normalmente sem
          transcrição, ou habilite o fallback opcional nas configurações do consultório.
        </p>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {errorMessage}
        </p>
      ) : null}

      <div
        className={cn(
          "flex max-h-72 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-surface/40 p-3",
          feedClassName,
        )}
      >
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum trecho transcrito ainda nesta sessão.
          </p>
        ) : (
          segments
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((segment) => (
              <p key={segment.sequence} className="text-sm text-foreground">
                {segment.text}
              </p>
            ))
        )}
      </div>
    </div>
  );
}
