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
import { listPlans } from "@/features/finance/queries";
import { sessionChargeIsApplicable } from "@/features/sessions/charge-eligibility";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { elapsedSecondsBetween, formatElapsedHms } from "@/lib/utils/elapsed";
import { formatInTimeZone } from "@/lib/utils/timezone";

function calendarDateInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

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

  const [dpep, workingNotes, transcriptSegments, appointment, clinicalProfile, plans] = await Promise.all([
    getSessionDpep(session.id),
    getSessionWorkingNotes(session.id),
    listTranscriptSegments(session.id),
    session.appointment_id
      ? getAppointment(organizationId, session.appointment_id).catch(() => null)
      : Promise.resolve(null),
    getPatientClinicalProfile(patient.id),
    listPlans(organizationId, patient.id),
  ]);

  const pendingNotes: string[] = [];
  if (!dpep?.demand?.trim()) pendingNotes.push("demanda em branco");
  if (!dpep?.plan?.trim()) pendingNotes.push("plano em branco");
  const durationSeconds = session.started_at
    ? elapsedSecondsBetween(session.started_at, session.ended_at ?? new Date().toISOString())
    : 0;
  const defaultDate = calendarDateInTimeZone(new Date().toISOString(), timezone);
  const isoDate = session.started_at
    ? formatInTimeZone(session.started_at, timezone, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

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
              modalityLabel: MODALITY_LABELS[appointment.modality],
              meetUrl:
                appointment.meet_status === "success" && appointment.meet_url
                  ? appointment.meet_url
                  : null,
            }
          : null
      }
      initialElapsedSeconds={durationSeconds}
      finalize={{
        patientId: patient.id,
        patientDisplayName: patient.preferred_name,
        sessionDateLabel: isoDate,
        durationLabel: formatElapsedHms(durationSeconds),
        status: session.status,
        dpepFilled: {
          demand: Boolean(dpep?.demand?.trim()),
          procedures: Boolean(dpep?.procedures?.trim()),
          evolution: Boolean(dpep?.evolution?.trim()),
          plan: Boolean(dpep?.plan?.trim()),
        },
        pendingNotes,
        canCharge: sessionChargeIsApplicable({
          defaultSessionValue: patient.default_session_value,
          plans,
        }),
        patients: [
          {
            id: patient.id,
            preferred_name: patient.preferred_name,
            public_code: patient.public_code,
          },
        ],
        defaultDate,
      }}
    />
  );
}
