import { Plus, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PatientListItem } from "@/features/patients/components/patient-list-item";
import { PatientsToolbar } from "@/features/patients/components/patients-toolbar";
import { PATIENT_STATUS_VALUES, type PatientStatus } from "@/features/patients/contracts";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Pacientes — Tesseli" };

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Users className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-[28px] italic font-medium leading-tight text-foreground">
              Gestão de Pacientes
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie seus pacientes e acompanhamentos
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/app/patients/new">
            <Plus className="size-4" aria-hidden />
            Cadastrar Paciente
          </Link>
        </Button>
      </div>

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
