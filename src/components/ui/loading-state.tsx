import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  fullPage?: boolean;
}

export function LoadingState({
  label = "Carregando…",
  fullPage = false,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted-foreground",
        fullPage ? "min-h-[60vh]" : "py-12",
        className,
      )}
      {...props}
    >
      <Loader2 className="size-6 animate-spin text-sage-700" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
