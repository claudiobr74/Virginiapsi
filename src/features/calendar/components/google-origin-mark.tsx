import { CalendarDays } from "lucide-react";

export function GoogleOriginMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
      <CalendarDays className={compact ? "size-2.5" : "size-3"} aria-hidden />
      Google
    </span>
  );
}
