import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { PendenciesBoard } from "@/features/dashboard/components/pendencies-board";
import { listPendencies } from "@/features/dashboard/pendency-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("Pendências") };

export default async function PendenciasPage() {
  const { organizationId, role } = await requireOrgContext();
  const items = await listPendencies(organizationId, role);

  return (
    <PageContainer>
      <h1 className="font-serif text-2xl font-bold text-foreground">
        Central de Pendências Inteligente
      </h1>
      <PendenciesBoard items={items} />
    </PageContainer>
  );
}
