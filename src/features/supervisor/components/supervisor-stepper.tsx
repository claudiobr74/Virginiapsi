import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { n: 1 as const, label: "Caso" },
  { n: 2 as const, label: "Objetivo" },
  { n: 3 as const, label: "Análise" },
];

export function SupervisorStepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="flex flex-wrap items-center justify-center gap-3 py-1 sm:gap-4">
      {STEPS.map((step, index) => {
        const complete = step.n < current;
        const active = step.n === current;
        return (
          <li key={step.n} className="flex items-center gap-3 sm:gap-4">
            {index > 0 ? (
              <span className="hidden h-px w-12 bg-border sm:block" aria-hidden />
            ) : null}
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-xl text-xs font-semibold",
                  active
                    ? "bg-primary text-primary-foreground"
                    : complete
                      ? "bg-sage-light/60 text-primary"
                      : "bg-surface text-muted-foreground",
                )}
              >
                {complete ? <Check className="size-3.5" aria-hidden /> : step.n}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
