import { CalendarEventBlock } from "@/features/calendar/components/calendar-event-block";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { formatAgendaLongDate } from "@/features/calendar/display";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTH_VISIBLE_EVENTS = 3;

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

function sortByStart(appointments: AppointmentRow[]): AppointmentRow[] {
  return [...appointments].sort((left, right) =>
    left.starts_at.localeCompare(right.starts_at),
  );
}

export function MonthView({
  days,
  appointmentsByDay,
  today,
  timeZone,
  selectedId,
  onSelectDay,
  onSelect,
}: {
  days: string[];
  appointmentsByDay: Map<string, AppointmentRow[]>;
  today: string;
  timeZone: string;
  selectedId?: string | null;
  onSelectDay: (day: string) => void;
  onSelect: (appointment: AppointmentRow) => void;
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
          const appointments = sortByStart(appointmentsByDay.get(day) ?? []);
          const isToday = day === today;
          const dayNumber = Number(day.split("-")[2]);
          const visible = appointments.slice(0, MONTH_VISIBLE_EVENTS);
          const hiddenCount = appointments.length - visible.length;

          return (
            <div
              key={day}
              className={cn(
                "flex min-h-[108px] flex-col items-stretch gap-0.5 border-b border-r border-border p-1.5 text-left",
                isToday && "bg-sage-light/40",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                className="mb-0.5 flex w-full items-center justify-between gap-1 rounded px-0.5 text-left hover:bg-surface/60"
                aria-label={`Abrir ${formatAgendaLongDate(day, timeZone)}`}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center font-sans text-sm font-semibold",
                    isToday
                      ? "rounded-full bg-sage-700 text-primary-foreground"
                      : "text-foreground",
                  )}
                >
                  {dayNumber}
                </span>
              </button>
              <div className="flex min-w-0 flex-col gap-0.5">
                {visible.map((appointment) => (
                  <CalendarEventBlock
                    key={appointment.id}
                    appointment={appointment}
                    timeZone={timeZone}
                    density="month"
                    selected={appointment.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="px-1 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{hiddenCount} mais
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {overflow.map((day) => (
          <button
            key={`overflow-${day}`}
            type="button"
            onClick={() => onSelectDay(day)}
            className="flex min-h-[108px] flex-col items-start border-b border-r border-border bg-background/40 p-1.5 text-left text-muted-foreground/70 hover:bg-surface/40"
          >
            <span className="inline-flex size-6 items-center justify-center font-sans text-sm font-semibold">
              {Number(day.split("-")[2])}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
