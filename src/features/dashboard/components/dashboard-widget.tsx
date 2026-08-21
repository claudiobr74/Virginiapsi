import type { ReactNode } from "react";

export function DashboardWidget({
  id,
  title,
  description,
  actions,
  children,
  empty,
  emptyLabel,
}: {
  id: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  empty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={id} className="font-serif text-[22px] italic font-semibold text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="shrink-0 pt-1 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
        {actions ? <div className="shrink-0 pt-1">{actions}</div> : null}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        children
      )}
    </section>
  );
}
