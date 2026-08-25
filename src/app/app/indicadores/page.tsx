import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { IndicatorsBoard } from "@/features/dashboard/components/indicators-board";
import { getIndicatorSnapshot } from "@/features/dashboard/indicator-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = { title: pageTitle("Indicadores") };

export default async function IndicadoresPage() {
  const { organizationId, timezone, role } = await requireOrgContext();
  const snapshot = await getIndicatorSnapshot(organizationId, timezone, role);

  return (
    <PageContainer>
      <h1 className="font-serif text-[28px] font-bold leading-tight text-foreground">
        Indicadores e Métricas Clínicas
      </h1>
      <IndicatorsBoard snapshot={snapshot} />
    </PageContainer>
  );
}
