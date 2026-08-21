import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/section-header";

export function PatientHubSection({
  id,
  title,
  description,
  actions,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-border bg-card p-6"
    >
      <SectionHeader title={title} description={description} actions={actions} />
      {children}
    </section>
  );
}
