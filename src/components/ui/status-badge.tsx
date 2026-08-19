import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Info,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export const STATUS_BADGE_STATUSES = [
  "active",
  "pending",
  "completed",
  "confirmed",
  "failed",
  "cancelled",
  "info",
  "attention",
] as const;

export type StatusBadgeStatus = (typeof STATUS_BADGE_STATUSES)[number];

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      status: {
        active: "bg-success-bg text-success",
        pending: "bg-pending-bg text-pending",
        completed: "bg-success-bg text-success",
        confirmed: "bg-confirmed-bg text-confirmed",
        failed: "bg-failed-bg text-failed",
        cancelled: "bg-cancelled-bg text-cancelled",
        info: "bg-info-bg text-info",
        attention: "bg-attention-bg text-attention",
      } satisfies Record<StatusBadgeStatus, string>,
    },
    defaultVariants: {
      status: "info",
    },
  },
);

const STATUS_ICON: Record<StatusBadgeStatus, React.ComponentType<{ className?: string }>> = {
  active: ShieldCheck,
  pending: Clock,
  completed: CheckCircle2,
  confirmed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
  info: Info,
  attention: AlertTriangle,
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  status: StatusBadgeStatus;
  label: string;
  pulse?: boolean;
}

export function StatusBadge({
  status,
  label,
  pulse = false,
  className,
  ...props
}: StatusBadgeProps) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn(statusBadgeVariants({ status }), className)} {...props}>
      {status === "active" && pulse ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
      ) : (
        <Icon className="size-3.5" aria-hidden />
      )}
      {label}
    </span>
  );
}
