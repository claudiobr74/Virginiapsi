import { AppointmentCard } from "@/features/calendar/components/appointment-card";
import { TimedEventColumn, TimedHourGutter } from "@/features/calendar/components/timed-event-column";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { agendaHourRange } from "@/features/calendar/event-layout";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function dayNumber(dateStr: string) {
  return dateStr.split("-")[2];
}

export function WeekView({
  days,
  appointmentsByDay,
  timeZone,
  today,
  selectedId,
  onSelect,
}: {
  days: string[];
  appointmentsByDay: Map<string, AppointmentRow[]>;
  timeZone: string;
  today: string;
  selectedId?: string | null;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  const allAppointments = days.flatMap((day) => appointmentsByDay.get(day) ?? []);
  const { startHour, endHour } = agendaHourRange(allAppointments, timeZone);

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[16px] border border-border bg-card lg:block">
        <div
          className="min-w-[960px]"
          style={{
            display: "grid",
            gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="border-b border-border bg-card" />
          {days.map((day, index) => {
            const isToday = day === today;
            return (
              <div
                key={`head-${day}`}
                className={cn(
                  "border-b border-l border-border px-2 py-2",
                  isToday && "bg-sage-light/40",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {WEEKDAY_LABELS[index]}
                </p>
                <p
                  className={cn(
                    "font-serif text-xl font-bold leading-none",
                    isToday ? "text-sage-700" : "text-foreground",
                  )}
                >
                  {dayNumber(day)}
                </p>
              </div>
            );
          })}

          <TimedHourGutter startHour={startHour} endHour={endHour} />
          {days.map((day) => (
            <TimedEventColumn
              key={day}
              appointments={appointmentsByDay.get(day) ?? []}
              timeZone={timeZone}
              startHour={startHour}
              endHour={endHour}
              selectedId={selectedId}
              density="week"
              isToday={day === today}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {days.map((day, index) => {
          const appointments = appointmentsByDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <div
              key={day}
              className={cn(
                "flex flex-col gap-1.5 rounded-[16px] border border-border bg-card p-3",
                isToday && "border-primary/60 bg-cream/50",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {WEEKDAY_LABELS[index]}
                </span>
                <span
                  className={cn(
                    "font-serif text-lg font-bold",
                    isToday ? "text-primary" : "text-foreground",
                  )}
                >
                  {dayNumber(day)}
                </span>
              </div>
              {appointments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem consultas</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {appointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      timeZone={timeZone}
                      density="stack"
                      selected={appointment.id === selectedId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
