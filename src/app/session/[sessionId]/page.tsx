import { notFound, redirect } from "next/navigation";
import { ActiveSessionView } from "@/features/sessions/components/active-session-view";
import {
  getClinicalSession,
  getSessionDpep,
  getSessionWorkingNotes,
  listTranscriptSegments,
} from "@/features/sessions/queries";
import { getPatient } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export async function generateMetadata({
  params,
}: PageProps<"/session/[sessionId]">) {
  const { sessionId } = await params;
  const { organizationId, role } = await requireOrgContext();
  if (role !== "psychologist_admin") {
    return { title: "Sessão — Tesseli" };
  }
  const session = await getClinicalSession(organizationId, sessionId);
  const patient = session ? await getPatient(organizationId, session.patient_id) : null;
  return {
    title: patient ? `Sessão — ${patient.preferred_name} — Tesseli` : "Sessão — Tesseli",
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
  if (role !== "psychologist_admin") {
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

  const [dpep, workingNotes, transcriptSegments] = await Promise.all([
    getSessionDpep(session.id),
    getSessionWorkingNotes(session.id),
    listTranscriptSegments(session.id),
  ]);

  return (
    <ActiveSessionView
      session={session}
      patientDisplayName={patient.preferred_name}
      timezone={timezone}
      dpep={dpep}
      workingNotes={workingNotes}
      transcriptSegments={transcriptSegments}
    />
  );
}
