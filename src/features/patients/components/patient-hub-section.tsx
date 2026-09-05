import type { ReactNode } from "react";
import { Card, type CardTone } from "@/components/ui/card";

export function PatientHubSection({
  id,
  title,
  description,
  actions,
  children,
  tone = "neutral",
  icon,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  tone?: CardTone;
  icon?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card
        tone={tone}
        headed
        icon={icon}
        title={title}
        description={description}
        action={actions}
      >
        {children}
      </Card>
    </section>
  );
}
