import type { AppointmentRow } from "@/features/calendar/contracts";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function leadingBlankDays(firstDay: string): number {
  const [year, month, day] = firstDay.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

export function MonthView({
  days,
  appointmentsByDay,
  today,
  onSelectDay,
}: {
  days: string[];
  appointmentsByDay: Map<string, AppointmentRow[]>;
  today: string;
  onSelectDay: (day: string) => void;
}) {
  const blanks = leadingBlankDays(days[0]);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: blanks }).map((_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {days.map((day) => {
          const appointments = appointmentsByDay.get(day) ?? [];
          const isToday = day === today;
          const dayNumber = Number(day.split("-")[2]);
          const activeCount = appointments.filter(
            (appointment) => appointment.status !== "cancelled",
          ).length;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex min-h-20 flex-col items-start gap-1 rounded-xl border border-border bg-card p-2 text-left transition-colors hover:border-sage-light hover:bg-surface/60",
                isToday && "border-primary/60 bg-cream/50",
              )}
            >
              <span
                className={cn(
                  "font-mono text-xs font-semibold",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {dayNumber}
              </span>
              {activeCount > 0 ? (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {activeCount} {activeCount === 1 ? "consulta" : "consultas"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
