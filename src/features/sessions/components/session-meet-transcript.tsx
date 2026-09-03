"use client";

import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  SessionMeetTranscriptEntryRow,
  SessionMeetTranscriptStatus,
  SessionMeetTranscriptSyncResult,
} from "@/features/sessions/session-meet-contracts";

export type SessionMeetTranscriptSyncAction = (
  sessionId: string,
) => Promise<SessionMeetTranscriptSyncResult>;

const INITIAL_POLL_DELAY_MS = 45_000;

export function SessionMeetTranscript({
  sessionId,
  status,
  autoTranscriptionEnabled,
  entries,
  timezone,
  syncAction,
}: {
  sessionId: string;
  status: SessionMeetTranscriptStatus;
  autoTranscriptionEnabled: boolean;
  entries: SessionMeetTranscriptEntryRow[];
  timezone: string;
  syncAction?: SessionMeetTranscriptSyncAction;
}) {
  const router = useRouter();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!syncAction || ["imported", "failed"].includes(status)) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      timer = setTimeout(async () => {
        const result = await syncAction(sessionId);
        if (cancelled) return;

        if (result.status === "imported") {
          setSyncMessage(null);
          router.refresh();
          return;
        }

        if (result.error) {
          setSyncMessage(result.error);
        } else {
          setSyncMessage(null);
        }

        if (result.nextPollMs) {
          schedule(result.nextPollMs);
        }
      }, delayMs);
    };

    schedule(INITIAL_POLL_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, sessionId, status, syncAction]);

  const speakerLabels = useMemo(() => {
    const labels = new Map<string, string>();
    let next = 1;
    for (const entry of entries) {
      const key = entry.participant_resource ?? "unknown";
      if (!labels.has(key)) {
        labels.set(key, `Falante ${next}`);
        next += 1;
      }
    }
    return labels;
  }, [entries]);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: timezone,
      }),
    [timezone],
  );

  return (
    <section className="rounded-2xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="font-serif text-lg font-bold text-foreground">
              Transcrição do Google Meet
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Vinculada diretamente a esta sessão clínica.
          </p>
        </div>
        {status === "imported" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Importada
          </span>
        ) : status === "awaiting_artifact" || status === "not_started" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Aguardando Meet
          </span>
        ) : null}
      </div>

      {status === "imported" ? (
        entries.length > 0 ? (
          <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-2">
            {entries.map((entry) => {
              const key = entry.participant_resource ?? "unknown";
              return (
                <article key={entry.google_entry_name} className="text-sm leading-6">
                  <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {speakerLabels.get(key) ?? "Falante"}
                    </span>
                    <time dateTime={entry.start_time}>
                      {formatter.format(new Date(entry.start_time))}
                    </time>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-foreground">{entry.text}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            O Google gerou a transcrição, mas não retornou falas estruturadas para esta sessão.
          </p>
        )
      ) : status === "unavailable" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          A transcrição ainda não ficou disponível. O VirgíniaPsi voltará a consultar o Google
          enquanto esta sessão estiver aberta ou quando ela for reaberta.
        </p>
      ) : (
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <p>
            Enquanto esta sessão estiver aberta, o VirgíniaPsi consulta periodicamente o Google e
            importa a transcrição quando ela estiver disponível. Ao reabrir a sessão, a consulta é
            retomada.
          </p>
          {!autoTranscriptionEnabled ? (
            <p>
              A configuração automática não foi aceita pelo Google. Se a transcrição for iniciada
              manualmente no Meet, o arquivo também será detectado e importado.
            </p>
          ) : null}
          {syncMessage ? <p className="text-xs text-attention">{syncMessage}</p> : null}
        </div>
      )}
    </section>
  );
}
