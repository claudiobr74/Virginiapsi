import { Plus, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { PatientListItem } from "@/features/patients/components/patient-list-item";
import { PatientsToolbar } from "@/features/patients/components/patients-toolbar";
import { PATIENT_STATUS_VALUES, type PatientStatus } from "@/features/patients/contracts";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Pacientes — SerenaPsi" };

function parseStatus(value: string | undefined): PatientStatus | "all" {
  return value && (PATIENT_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as PatientStatus)
    : "all";
}

export default async function PatientsPage({
  searchParams,
}: PageProps<"/app/patients">) {
  const { organizationId } = await requireOrgContext();
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = parseStatus(
    typeof params.status === "string" ? params.status : undefined,
  );

  const patients = await listPatients(organizationId, { search, status });

  return (
    <PageContainer>
      <PageHeader
        icon={Users}
        title="Pacientes"
        subtitle="Cadastro administrativo e acesso ao Patient Hub"
        actions={
          <Button asChild>
            <Link href="/app/patients/new">
              <Plus className="size-4" aria-hidden />
              Novo paciente
            </Link>
          </Button>
        }
      />

      <PatientsToolbar />

      {patients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            search || status !== "all"
              ? "Nenhum paciente encontrado"
              : "Nenhum paciente cadastrado ainda"
          }
          description={
            search || status !== "all"
              ? "Ajuste a busca ou os filtros."
              : "Cadastre o primeiro paciente para começar."
          }
          action={
            !search && status === "all" ? (
              <Button asChild size="sm">
                <Link href="/app/patients/new">Novo paciente</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {patients.map((patient) => (
            <PatientListItem key={patient.id} patient={patient} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
