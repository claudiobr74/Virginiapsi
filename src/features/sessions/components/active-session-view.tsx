"use client";

import { ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  MeetActionButton,
  type MeetRequestAction,
} from "@/features/calendar/components/meet-action-button";
import type {
  AppointmentModality,
  AppointmentOrigin,
  MeetStatus,
} from "@/features/calendar/contracts";
import { DpepForm } from "@/features/sessions/components/dpep-form";
import { FinalizeSessionWizard } from "@/features/sessions/components/finalize-session-wizard";
import { SessionAiPanel } from "@/features/sessions/components/session-ai-panel";
import { SessionElapsedTimer } from "@/features/sessions/components/session-elapsed-timer";
import { SessionFeatureErrorBoundary } from "@/features/sessions/components/session-feature-error-boundary";
import { TranscriptPanel } from "@/features/sessions/components/transcript-panel";
import { WorkingNotesForm } from "@/features/sessions/components/working-notes-form";
import {
  CLINICAL_SESSION_STATUS_LABELS,
  type ClinicalSessionRow,
  type SessionDpepRow,
  type SessionWorkingNotesRow,
  type TranscriptSegmentRow,
} from "@/features/sessions/contracts";
import { elapsedSecondsBetween, formatElapsedHms } from "@/lib/utils/elapsed";
import { formatInTimeZone } from "@/lib/utils/timezone";

export type SessionAppointmentContext = {
  id: string;
  modality: AppointmentModality;
  modalityLabel: string;
  origin: AppointmentOrigin;
  meetUrl: string | null;
  meetStatus: MeetStatus;
};

export function ActiveSessionView({
  session,
  patientDisplayName,
  patientPublicCode,
  therapyGoals,
  timezone,
  dpep,
  workingNotes,
  transcriptSegments,
  appointment,
  requestMeetAction,
  initialElapsedSeconds,
}: {
  session: ClinicalSessionRow;
  patientDisplayName: string;
  patientPublicCode: string | null;
  therapyGoals: string | null;
  timezone: string;
  dpep: SessionDpepRow | null;
  workingNotes: SessionWorkingNotesRow | null;
  transcriptSegments: TranscriptSegmentRow[];
  appointment: SessionAppointmentContext | null;
  requestMeetAction?: MeetRequestAction;
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
    isFinalized && session.started_at && session.ended_at
      ? `Duração ${formatElapsedHms(elapsedSecondsBetween(session.started_at, session.ended_at))}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function refreshAfterSave() {
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/app/patients/${session.patient_id}`}
              aria-label="Voltar para o prontuário do paciente"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-background"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-serif text-2xl font-bold text-foreground">
                  {patientDisplayName}
                  {patientPublicCode ? (
                    <span className="font-sans text-base font-medium text-muted-foreground">
                      {" "}
                      • {patientPublicCode}
                    </span>
                  ) : null}
                </h1>
                {appointment?.modalityLabel ? (
                  <span className="rounded-md bg-sage-light px-2 py-1 text-xs font-semibold text-sage-700">
                    {appointment.modalityLabel}
                  </span>
                ) : null}
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

          <div className="flex flex-wrap items-center gap-3">
            <SessionElapsedTimer
              startedAt={session.started_at}
              endedAt={session.ended_at}
              running={isInProgress}
              initialElapsedSeconds={initialElapsedSeconds}
              className="text-base text-attention"
            />
            {appointment ? (
              <MeetActionButton
                appointmentId={appointment.id}
                modality={appointment.modality}
                origin={appointment.origin}
                meetUrl={appointment.meetUrl}
                meetStatus={appointment.meetStatus}
                requestMeetAction={requestMeetAction}
                size="sm"
                variant="secondary"
              />
            ) : null}
            {!isFinalized ? <FinalizeSessionWizard sessionId={session.id} /> : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-12">
          <div>
            <h2 className="font-serif text-[28px] font-bold text-foreground">
              {isFinalized ? "Revisão da Sessão" : "Anotações da Sessão"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isFinalized
                ? "O DPEP abaixo é o registro estruturado desta sessão."
                : "O DPEP é o registro estruturado da sessão. Nada entra no prontuário sem revisão humana."}
            </p>
            {isFinalized ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/app/patients/${session.patient_id}`}>Ir ao prontuário</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/app/agenda?new=1">Agendar próxima sessão</Link>
                </Button>
              </div>
            ) : null}
          </div>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-serif text-lg font-bold text-foreground">
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

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 font-serif text-lg font-bold text-foreground">DPEP</h2>
            <SessionFeatureErrorBoundary>
              <DpepForm
                sessionId={session.id}
                dpep={dpep}
                version={session.version}
                disabled={isFinalized}
                onSaved={refreshAfterSave}
              />
            </SessionFeatureErrorBoundary>
          </section>
        </div>

        <aside className="flex w-full flex-col gap-6 border-t border-border bg-card px-4 py-6 sm:px-8 lg:w-[480px] lg:shrink-0 lg:border-l lg:border-t-0">
          <section className="flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              Transcrição em tempo real
            </h2>
            <TranscriptPanel
              sessionId={session.id}
              patientId={session.patient_id}
              organizationId={session.organization_id}
              initialSegments={transcriptSegments}
              disabled={isFinalized}
              feedClassName="max-h-72 lg:max-h-[min(28rem,calc(100dvh-22rem))]"
            />
          </section>

          {therapyGoals?.trim() ? (
            <details className="rounded-lg border border-border p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
                Objetivos terapêuticos
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {therapyGoals}
              </p>
            </details>
          ) : null}

          <section className="rounded-2xl border border-border bg-background p-5">
            <h2 className="mb-4 font-serif text-lg font-bold text-foreground">Apoio de IA</h2>
            <SessionFeatureErrorBoundary>
              <SessionAiPanel sessionId={session.id} />
            </SessionFeatureErrorBoundary>
          </section>
        </aside>
      </div>
    </div>
  );
}
