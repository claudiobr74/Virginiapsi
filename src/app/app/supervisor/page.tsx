import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getPatient, listPatients } from "@/features/patients/queries";
import { listPatientSessions } from "@/features/sessions/queries";
import { isClinicalPractitioner } from "@/features/organizations/roles";
import { RestrictedAccess } from "@/features/shell/restricted-access";
import { SupervisorConsole } from "@/features/supervisor/components/supervisor-console";
import { SupervisorPatientPicker } from "@/features/supervisor/components/supervisor-patient-picker";
import { SupervisorStepper } from "@/features/supervisor/components/supervisor-stepper";
import { listSupervisorRuns } from "@/features/supervisor/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Supervisor IA — VirgíniaPsi" };

export default async function SupervisorPage({
  searchParams,
}: PageProps<"/app/supervisor">) {
  const { organizationId, role } = await requireOrgContext();
  const params = await searchParams;

  if (!isClinicalPractitioner(role)) {
    return <RestrictedAccess sectionLabel="o Supervisor IA" />;
  }

  const patientId = typeof params.patientId === "string" ? params.patientId : undefined;

  if (!patientId) {
    const patients = await listPatients(organizationId, { status: "active" });
    return (
      <PageContainer>
        <PageHeader
          icon={Sparkles}
          title="Supervisor Clínico IA"
          subtitle="Hipóteses, formulação e apoio clínico — sempre com revisão humana"
        />
        {patients.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nenhum paciente ativo"
            description="Cadastre um paciente para usar o Supervisor Clínico IA."
          />
        ) : (
          <>
            <SupervisorStepper current={1} />
            <SupervisorPatientPicker patients={patients} />
          </>
        )}
      </PageContainer>
    );
  }

  const patient = await getPatient(organizationId, patientId);
  if (!patient) {
    redirect("/app/supervisor");
  }

  const [allSessions, pastRuns] = await Promise.all([
    listPatientSessions(organizationId, patientId),
    listSupervisorRuns(organizationId, patientId),
  ]);
  const finalizedSessions = allSessions.filter((session) => session.status === "finalized");

  return (
    <PageContainer>
      <PageHeader
        icon={Sparkles}
        title="Supervisor Clínico IA"
        subtitle={`${patient.preferred_name} — ${patient.public_code}`}
      />
      <SupervisorConsole
        patientId={patient.id}
        patientDisplayName={patient.preferred_name}
        patientPublicCode={patient.public_code}
        patientModality={patient.modality}
        finalizedSessions={finalizedSessions}
        pastRuns={pastRuns}
      />
    </PageContainer>
  );
}
