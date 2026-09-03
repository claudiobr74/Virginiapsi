import { notFound, redirect } from "next/navigation";
import { getAppointment } from "@/features/calendar/appointment-queries";
import { getPatient, getPatientClinicalProfile } from "@/features/patients/queries";
import { MODALITY_LABELS } from "@/features/patients/contracts";
import { ActiveSessionView } from "@/features/sessions/components/active-session-view";
import {
  getClinicalSession,
  getSessionDpep,
  getSessionWorkingNotes,
  listTranscriptSegments,
} from "@/features/sessions/queries";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { elapsedSecondsBetween } from "@/lib/utils/elapsed";

export async function generateMetadata({
  params,
}: PageProps<"/session/[sessionId]">) {
  const { sessionId } = await params;
  const { organizationId, role } = await requireOrgContext();
  if (!isClinicalPractitioner(role)) {
    return { title: "Sessão — VirgíniaPsi" };
  }
  const session = await getClinicalSession(organizationId, sessionId);
  const patient = session ? await getPatient(organizationId, session.patient_id) : null;
  return {
    title: patient ? `Sessão — ${patient.preferred_name} — VirgíniaPsi` : "Sessão — VirgíniaPsi",
  };
}

export default async function ActiveSessionPage({
  params,
}: PageProps<"/session/[sessionId]">) {
  const { sessionId } = await params;
  const { organizationId, role, timezone } = await requireOrgContext();

  // Clinical session mode is a psychologist_admin-only surface
  // (.cursor/rules/10-clinical-domain.mdc) — the secretary never even
  // attempts these queries, RLS aside.
  if (!isClinicalPractitioner(role)) {
    redirect("/app");
  }

  const session = await getClinicalSession(organizationId, sessionId);
  if (!session) {
    notFound();
  }

  const patient = await getPatient(organizationId, session.patient_id);
  if (!patient) {
    notFound();
  }

  const [dpep, workingNotes, transcriptSegments, appointment, clinicalProfile] = await Promise.all([
    getSessionDpep(session.id),
    getSessionWorkingNotes(session.id),
    listTranscriptSegments(session.id),
    session.appointment_id
      ? getAppointment(organizationId, session.appointment_id).catch(() => null)
      : Promise.resolve(null),
    getPatientClinicalProfile(patient.id),
  ]);

  return (
    <ActiveSessionView
      session={session}
      patientDisplayName={patient.preferred_name}
      patientPublicCode={patient.public_code}
      therapyGoals={clinicalProfile?.therapy_goals ?? null}
      timezone={timezone}
      dpep={dpep}
      workingNotes={workingNotes}
      transcriptSegments={transcriptSegments}
      appointment={
        appointment
          ? {
              id: appointment.id,
              modality: appointment.modality,
              modalityLabel: MODALITY_LABELS[appointment.modality],
              origin: appointment.origin,
              meetUrl:
                appointment.meet_status === "success" && appointment.meet_url
                  ? appointment.meet_url
                  : null,
              meetStatus: appointment.meet_status,
            }
          : null
      }
      initialElapsedSeconds={
        session.started_at
          ? elapsedSecondsBetween(
              session.started_at,
              session.ended_at ?? new Date().toISOString(),
            )
          : 0
      }
    />
  );
}
