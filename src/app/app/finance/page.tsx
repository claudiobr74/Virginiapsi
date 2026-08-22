import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceConsole } from "@/features/finance/components/finance-console";
import { getFinanceSnapshot } from "@/features/finance/queries";
import { listPatients } from "@/features/patients/queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata = { title: "Financeiro — Tesseli" };

export default async function FinancePage() {
  const { organizationId, role, timezone } = await requireOrgContext();
  const patients = await listPatients(organizationId, { status: "active" });
  const names = new Map(patients.map((patient) => [patient.id, patient.preferred_name]));
  const snapshot = await getFinanceSnapshot(organizationId, role, names);

  return (
    <PageContainer>
      <PageHeader
        icon={Wallet}
        title="Financeiro"
        subtitle="Gestão financeira do consultório"
      />
      {snapshot.access === "none" ? (
        <EmptyState
          icon={Wallet}
          title="Sem acesso ao financeiro"
          description="A administradora não liberou visualização ou gestão financeira para a secretaria."
        />
      ) : (
        <FinanceConsole
          snapshot={snapshot}
          patients={patients.map((patient) => ({
            id: patient.id,
            preferred_name: patient.preferred_name,
          }))}
          isAdmin={role === "psychologist_admin"}
          timezone={timezone}
        />
      )}
    </PageContainer>
  );
}
