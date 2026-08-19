import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";

export interface PlaceholderModulePageProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  phaseNote: string;
}

export function PlaceholderModulePage({
  icon,
  title,
  subtitle,
  phaseNote,
}: PlaceholderModulePageProps) {
  return (
    <PageContainer>
      <PageHeader icon={icon} title={title} subtitle={subtitle} />
      <EmptyState
        icon={icon}
        title="Este módulo ainda não foi implementado"
        description={phaseNote}
      />
    </PageContainer>
  );
}
