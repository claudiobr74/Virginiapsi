import { getAppointmentVisualStatus } from "@/features/calendar/appointment-visual";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { monthCellStats } from "@/features/calendar/display";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function leadingBlankDays(firstDay: string): number {
  const [year, month, day] = firstDay.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function trailingOverflowDays(firstDay: string, count: number): string[] {
  const blanks = leadingBlankDays(firstDay);
  const remainder = (blanks + count) % 7;
  const need = remainder === 0 ? 0 : 7 - remainder;
  const lastDay = addDays(firstDay, count - 1);
  return Array.from({ length: need }, (_, index) => addDays(lastDay, index + 1));
}

function sessionCountLabel(count: number): string {
  if (count === 1) {
    return "1 sessão";
  }
  return `${count} sessões`;
}

export function MonthView({
  days,
  appointmentsByDay,
  today,
  now,
  onSelectDay,
}: {
  days: string[];
  appointmentsByDay: Map<string, AppointmentRow[]>;
  today: string;
  now?: Date;
  onSelectDay: (day: string) => void;
}) {
  const blanks = leadingBlankDays(days[0]);
  const overflow = trailingOverflowDays(days[0], days.length);

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="px-2 py-3">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: blanks }).map((_, index) => (
          <div
            key={`blank-${index}`}
            className="min-h-[108px] border-b border-r border-border bg-background/40 last:border-r-0"
          />
        ))}
        {days.map((day) => {
          const dayAppointments = appointmentsByDay.get(day) ?? [];
          const isToday = day === today;
          const dayNumber = Number(day.split("-")[2]);
          const visiblePills = dayAppointments.slice(0, 4);
          const validCount = monthCellStats(dayAppointments).count;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex min-h-[108px] flex-col items-start gap-1.5 border-b border-r border-border p-3 text-left transition-colors hover:bg-surface/60",
                isToday && "bg-sage-light/70",
              )}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span
                  className={cn(
                    "font-sans text-sm font-semibold",
                    isToday ? "text-sage-700" : "text-foreground",
                  )}
                >
                  {dayNumber}
                </span>
                {isToday ? (
                  <span className="rounded-md bg-sage-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                    Hoje
                  </span>
                ) : null}
              </div>
              {dayAppointments.length > 0 ? (
                <>
                  {validCount > 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      {sessionCountLabel(validCount)}
                    </p>
                  ) : null}
                  <span className="flex w-full flex-col gap-1">
                    {visiblePills.map((appointment) => {
                      const visual = getAppointmentVisualStatus(appointment, now);
                      return (
                        <span
                          key={appointment.id}
                          data-appointment-visual={visual.tone}
                          data-appointment-origin={appointment.origin}
                          style={visual.style}
                          className={cn(
                            "w-full break-words rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white",
                            visual.className,
                          )}
                        >
                          {appointment.summary_snapshot ?? "Consulta"}
                        </span>
                      );
                    })}
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
        {overflow.map((day) => (
          <button
            key={`overflow-${day}`}
            type="button"
            onClick={() => onSelectDay(day)}
            className="flex min-h-[108px] flex-col items-start border-b border-r border-border bg-background/40 p-3 text-left text-muted-foreground/70 hover:bg-surface/40"
          >
            <span className="font-sans text-sm font-semibold">{Number(day.split("-")[2])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
