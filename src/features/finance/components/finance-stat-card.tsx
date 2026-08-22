import { cn } from "@/lib/utils/cn";

export function FinanceStatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "attention" | "failed";
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "attention" && "text-attention",
          tone === "failed" && "text-failed",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
