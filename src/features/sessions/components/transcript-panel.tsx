"use client";

import { Mic, MicOff, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeStatus } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils/cn";
import { ImportRecordingControl } from "@/features/sessions/components/import-recording-control";
import {
  useSessionTranscription,
  type TranscriptSegmentResult,
} from "@/features/sessions/transcription/use-session-transcription";
import { nextTranscriptSequence } from "@/features/sessions/transcription/audio-chunk";
import type { TranscriptSegmentRow } from "@/features/sessions/contracts";

const STATE_LABEL: Record<string, { label: string; status: StatusBadgeStatus }> = {
  idle: { label: "Transcrição parada", status: "info" },
  authorizing: { label: "Preparando…", status: "pending" },
  requesting_microphone: { label: "Preparando…", status: "pending" },
  recording: { label: "Gravando", status: "active" },
  connection_degraded: { label: "Conexão instável", status: "attention" },
  local_backup: { label: "Gravação local de segurança", status: "attention" },
  recovering: { label: "Recuperando transcrição…", status: "pending" },
  stopping: { label: "Parando…", status: "pending" },
  completed: { label: "Transcrição finalizada", status: "completed" },
  error: { label: "Erro na transcrição", status: "failed" },
};

export function TranscriptPanel({
  sessionId,
  patientId,
  organizationId,
  initialSegments,
  disabled,
  feedClassName,
}: {
  sessionId: string;
  patientId: string;
  organizationId: string;
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
      provider: "groq-batch",
    })),
  );

  const initialSequences = useMemo(
    () => segments.map((segment) => segment.sequence),
    [segments],
  );

  const {
    state,
    errorMessage,
    segmentWarning,
    statusDetail,
    pendingRecoveryCount,
    backgroundWarning,
    lowStorageWarning,
    start,
    stop,
    recoverPending,
  } = useSessionTranscription({
    sessionId,
    patientId,
    organizationId,
    initialSequences,
    onSegment: (segment) =>
      setSegments((prev) =>
        prev.some((item) => item.sequence === segment.sequence) ? prev : [...prev, segment],
      ),
  });

  const isActive =
    state === "recording" ||
    state === "authorizing" ||
    state === "requesting_microphone" ||
    state === "connection_degraded" ||
    state === "local_backup" ||
    state === "stopping" ||
    state === "recovering";
  const meta = STATE_LABEL[state] ?? STATE_LABEL.idle;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-3 py-3">
        <StatusBadge
          status={meta.status}
          label={meta.label}
          pulse={state === "recording" || state === "local_backup"}
        />
        {isActive && state !== "recovering" ? (
          <Button
            type="button"
            variant="destructive"
            size="md"
            className="min-h-11 min-w-44"
            disabled={disabled || state === "authorizing" || state === "requesting_microphone" || state === "stopping"}
            onClick={() => void stop()}
          >
            <MicOff className="size-4" aria-hidden />
            Parar transcrição
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="min-h-11 min-w-44"
            disabled={disabled}
            onClick={() => void start()}
          >
            <Mic className="size-4" aria-hidden />
            Iniciar transcrição
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Transcrição em tempo real. Durante a sessão, pequenos trechos de áudio são enviados com
        segurança para gerar a transcrição. Se houver uma interrupção de conexão, os trechos ainda
        não processados podem ser preservados de forma criptografada neste dispositivo até que a
        transcrição possa continuar.
      </p>

      {statusDetail ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {statusDetail}
        </p>
      ) : null}

      {lowStorageWarning ? (
        <p role="status" className="text-sm text-attention">
          Pouco espaço disponível no dispositivo. A gravação local de segurança pode não conseguir
          preservar toda a sessão.
        </p>
      ) : null}

      {backgroundWarning ? (
        <p role="status" className="text-sm text-muted-foreground">
          {backgroundWarning}
        </p>
      ) : null}

      {pendingRecoveryCount > 0 && state !== "recovering" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm text-foreground">
            Encontramos trechos de uma sessão que ainda precisam ser transcritos.
          </p>
          <Button type="button" size="md" className="min-h-11 w-fit min-w-44" onClick={() => void recoverPending()}>
            Continuar processamento
          </Button>
        </div>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed">
          {errorMessage}
        </p>
      ) : null}

      {segmentWarning ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-attention/30 bg-attention-bg px-4 py-3 text-sm text-attention"
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {segmentWarning}
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

      <ImportRecordingControl
        sessionId={sessionId}
        patientId={patientId}
        nextSequence={nextTranscriptSequence(segments.map((segment) => segment.sequence))}
        disabled={disabled || isActive}
        onImported={(segment) =>
          setSegments((prev) =>
            prev.some((item) => item.sequence === segment.sequence) ? prev : [...prev, segment],
          )
        }
      />
    </div>
  );
}
