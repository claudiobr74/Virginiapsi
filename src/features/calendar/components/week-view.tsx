import { AppointmentCard } from "@/features/calendar/components/appointment-card";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function dayLabel(dateStr: string) {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

export function WeekView({
  days,
  appointmentsByDay,
  timeZone,
  today,
  isAdmin = false,
  onSelect,
}: {
  days: string[];
  appointmentsByDay: Map<string, AppointmentRow[]>;
  timeZone: string;
  today: string;
  isAdmin?: boolean;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day, index) => {
        const appointments = appointmentsByDay.get(day) ?? [];
        const isToday = day === today;
        return (
          <div
            key={day}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border border-border bg-card p-3",
              isToday && "border-primary/60 bg-cream/50",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {WEEKDAY_LABELS[index]}
              </span>
              <span
                className={cn(
                  "font-mono text-xs font-semibold",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {dayLabel(day)}
              </span>
            </div>
            {appointments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem consultas</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {appointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    timeZone={timeZone}
                    isAdmin={isAdmin}
                    compact
                    onClick={() => onSelect(appointment)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
