import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import type { FutureModuleSection } from "@/features/dashboard/contracts";

export function UpcomingPhaseSection({
  section,
  icon,
}: {
  section: FutureModuleSection;
  icon: LucideIcon;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={section.title} />
      <EmptyState
        icon={icon}
        title={`${section.title} chegam na Fase ${section.phase}`}
        description={section.description}
      />
    </section>
  );
}
