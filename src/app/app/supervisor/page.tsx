import { Sparkles } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getPatient, listPatients } from "@/features/patients/queries";
import { listPatientSessions } from "@/features/sessions/queries";
import { listSupervisorRuns } from "@/features/supervisor/queries";
import { SupervisorConsole } from "@/features/supervisor/components/supervisor-console";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { redirect } from "next/navigation";

export const metadata = { title: "Supervisor IA — Tesseli" };

export default async function SupervisorPage({
  searchParams,
}: PageProps<"/app/supervisor">) {
  const { organizationId, role } = await requireOrgContext();
  const params = await searchParams;

  if (role !== "psychologist_admin") {
    redirect("/app");
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
          <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-4">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Selecione um paciente para iniciar
            </span>
            {patients.map((patient) => (
              <Link
                key={patient.id}
                href={`/app/supervisor?patientId=${patient.id}`}
                className="rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface"
              >
                {patient.preferred_name} — {patient.public_code}
              </Link>
            ))}
          </div>
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
        finalizedSessions={finalizedSessions}
        pastRuns={pastRuns}
      />
    </PageContainer>
  );
}
