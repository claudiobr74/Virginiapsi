import type { ReactNode } from "react";
import { Card, type CardTone } from "@/components/ui/card";

export type DashboardWidgetTone = CardTone;

export function DashboardWidget({
  id,
  title,
  description,
  actions,
  children,
  empty,
  emptyLabel,
  tone = "neutral",
  icon,
}: {
  id: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  empty?: boolean;
  emptyLabel?: string;
  tone?: DashboardWidgetTone;
  icon?: ReactNode;
}) {
  return (
    <Card
      tone={tone}
      icon={icon}
      title={title}
      titleId={id}
      description={description}
      action={actions}
    >
      <section aria-labelledby={id} className="flex flex-col gap-4">
        {empty ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          children
        )}
      </section>
    </Card>
  );
}
