import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  icon: Icon,
  leading,
  title,
  subtitle,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-4">
        {leading ? (
          leading
        ) : Icon ? (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-xl italic font-bold leading-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
