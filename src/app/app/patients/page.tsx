import { Plus, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PatientDirectoryTable } from "@/features/patients/components/patient-directory-table";
import { PatientsToolbar } from "@/features/patients/components/patients-toolbar";
import { PATIENT_STATUS_VALUES, type PatientStatus } from "@/features/patients/contracts";
import { listPatientDirectory } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("Pacientes") };

function parseStatus(value: string | undefined): PatientStatus | "all" {
  return value && (PATIENT_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as PatientStatus)
    : "all";
}

export default async function PatientsPage({
  searchParams,
}: PageProps<"/app/patients">) {
  const { organizationId, timezone } = await requireOrgContext();
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = parseStatus(
    typeof params.status === "string" ? params.status : undefined,
  );

  const rows = await listPatientDirectory(organizationId, { search, status });

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-serif text-[28px] font-bold leading-tight text-foreground">
            Diretório de Pacientes
          </h1>
          <Button asChild className="shrink-0">
            <Link href="/app/patients/new">
              <Plus className="size-4" aria-hidden />
              Novo paciente
            </Link>
          </Button>
        </div>
        <PatientsToolbar />
      </div>

      {rows.length === 0 ? (
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
        <PatientDirectoryTable rows={rows} timeZone={timezone} />
      )}
    </PageContainer>
  );
}
