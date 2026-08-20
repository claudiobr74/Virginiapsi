"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { StatusBadge } from "@/components/ui/status-badge";
import { DpepForm } from "@/features/sessions/components/dpep-form";
import { FinalizeSessionWizard } from "@/features/sessions/components/finalize-session-wizard";
import { SessionAiPanel } from "@/features/sessions/components/session-ai-panel";
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

export function ActiveSessionView({
  session,
  patientDisplayName,
  timezone,
  dpep,
  workingNotes,
  transcriptSegments,
}: {
  session: ClinicalSessionRow;
  patientDisplayName: string;
  timezone: string;
  dpep: SessionDpepRow | null;
  workingNotes: SessionWorkingNotesRow | null;
  transcriptSegments: TranscriptSegmentRow[];
}) {
  const router = useRouter();
  const isFinalized = session.status === "finalized" || session.status === "canceled";

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
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Logo width={36} />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground">{patientDisplayName}</span>
            <span className="text-xs text-muted-foreground">
              {session.started_at
                ? formatInTimeZone(session.started_at, timezone, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            pulse={session.status === "in_progress"}
          />
          <Link href="/app/patients" className="text-xs font-semibold text-primary underline">
            Voltar
          </Link>
          {!isFinalized ? <FinalizeSessionWizard sessionId={session.id} /> : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">DPEP</h2>
          <DpepForm
            sessionId={session.id}
            dpep={dpep}
            version={session.version}
            disabled={isFinalized}
            onSaved={refreshAfterSave}
          />
        </section>

        <section className="rounded-3xl border border-attention/20 bg-attention-bg/20 p-5">
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

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">Transcrição</h2>
          <TranscriptPanel
            sessionId={session.id}
            patientId={session.patient_id}
            initialSegments={transcriptSegments}
            disabled={isFinalized}
          />
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold italic text-foreground">Session AI</h2>
          <SessionAiPanel
            sessionId={session.id}
            version={session.version}
            onDpepAppended={refreshAfterSave}
          />
        </section>
      </main>
    </div>
  );
}
