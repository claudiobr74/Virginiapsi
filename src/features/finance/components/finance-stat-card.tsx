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
    <div className="rounded-[16px] border border-border bg-card p-4 shadow-sm">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 font-serif text-[28px] font-bold leading-tight tabular-nums",
          tone === "success" && "text-success",
          tone === "attention" && "text-attention",
          tone === "failed" && "text-failed",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
