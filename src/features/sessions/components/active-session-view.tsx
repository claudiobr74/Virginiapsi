"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { DpepForm } from "@/features/sessions/components/dpep-form";
import { FinalizeSessionWizard } from "@/features/sessions/components/finalize-session-wizard";
import { SessionAiPanel } from "@/features/sessions/components/session-ai-panel";
import { SessionElapsedTimer } from "@/features/sessions/components/session-elapsed-timer";
import { TranscriptPanel } from "@/features/sessions/components/transcript-panel";
import { WorkingNotesForm } from "@/features/sessions/components/working-notes-form";
import {
  CLINICAL_SESSION_STATUS_LABELS,
  type ClinicalSessionRow,
  type SessionDpepRow,
  type SessionWorkingNotesRow,
  type TranscriptSegmentRow,
} from "@/features/sessions/contracts";
import { formatInTimeZone } from "@/lib/utils/timezone";

export type SessionAppointmentContext = {
  modalityLabel: string;
  meetUrl: string | null;
};

export function ActiveSessionView({
  session,
  patientDisplayName,
  timezone,
  dpep,
  workingNotes,
  transcriptSegments,
  appointment,
  initialElapsedSeconds,
}: {
  session: ClinicalSessionRow;
  patientDisplayName: string;
  timezone: string;
  dpep: SessionDpepRow | null;
  workingNotes: SessionWorkingNotesRow | null;
  transcriptSegments: TranscriptSegmentRow[];
  appointment: SessionAppointmentContext | null;
  initialElapsedSeconds: number;
}) {
  const router = useRouter();
  const isFinalized = session.status === "finalized" || session.status === "canceled";
  const isInProgress = session.status === "in_progress";
  const startedClock = session.started_at
    ? formatInTimeZone(session.started_at, timezone, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const contextLine = [
    startedClock ? `Início ${startedClock}` : null,
    appointment?.modalityLabel ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  // clinical_sessions.version is a single counter shared by DPEP and working
  // notes (see the migration header). Rather than juggle version/content
  // state by hand on the client — and risk one panel's re-render reverting
  // the other's just-saved text to a stale prop — every successful save
  // asks the server component to refetch, which is the only place that can
  // hand back DPEP, working notes and version all in sync.
  function refreshAfterSave() {
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link
              href="/app/patients"
              aria-label="Voltar para a lista de pacientes"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-surface"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-serif text-lg font-semibold italic text-foreground">
                  {patientDisplayName}
                </h1>
                <StatusBadge
                  status={
                    session.status === "in_progress"
                      ? "active"
                      : session.status === "finalized"
                        ? "completed"
                        : session.status === "canceled"
                          ? "cancelled"
                          : "pending"
                  }
                  label={CLINICAL_SESSION_STATUS_LABELS[session.status]}
                  pulse={isInProgress}
                />
              </div>
              {contextLine ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{contextLine}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 md:flex">
              {isInProgress ? (
                <span className="relative flex size-2" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
              ) : null}
              <SessionElapsedTimer
                startedAt={session.started_at}
                endedAt={session.ended_at}
                running={isInProgress}
                initialElapsedSeconds={initialElapsedSeconds}
                className="text-base text-primary"
              />
            </div>
            {appointment?.meetUrl ? (
              <a
                href={appointment.meetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-border bg-surface px-3 text-sm font-semibold text-deep-neutral hover:bg-sage-light/30"
              >
                Meet
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            {!isFinalized ? <FinalizeSessionWizard sessionId={session.id} /> : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-sage-light/25 px-4 py-2 sm:px-6 md:hidden">
          <div className="flex items-center gap-2">
            {isInProgress ? (
              <span className="relative flex size-2" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
            ) : null}
            <SessionElapsedTimer
              startedAt={session.started_at}
              endedAt={session.ended_at}
              running={isInProgress}
              initialElapsedSeconds={initialElapsedSeconds}
              className="text-base text-primary"
            />
          </div>
          <p className="text-[11px] font-medium text-muted-foreground">
            {isFinalized ? "Sessão encerrada" : "Atendimento em curso"}
          </p>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">DPEP</h2>
            <DpepForm
              sessionId={session.id}
              dpep={dpep}
              version={session.version}
              disabled={isFinalized}
              onSaved={refreshAfterSave}
            />
          </section>

          <section className="rounded-3xl border border-border bg-sage-light/10 p-5 shadow-sm">
            <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">
              Área de Trabalho Clínico
            </h2>
            <WorkingNotesForm
              sessionId={session.id}
              notes={workingNotes}
              version={session.version}
              disabled={isFinalized}
              onSaved={refreshAfterSave}
            />
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">Session AI</h2>
            <SessionAiPanel
              sessionId={session.id}
              version={session.version}
              onDpepAppended={refreshAfterSave}
            />
          </section>
        </div>

        <aside className="lg:sticky lg:top-[5.5rem] lg:self-start">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">
              Transcrição
            </h2>
            <TranscriptPanel
              sessionId={session.id}
              patientId={session.patient_id}
              initialSegments={transcriptSegments}
              disabled={isFinalized}
              feedClassName="max-h-72 lg:max-h-[min(36rem,calc(100dvh-18rem))]"
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
