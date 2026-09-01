import { getAppointmentVisualStatus } from "@/features/calendar/appointment-visual";
import { AppointmentCard } from "@/features/calendar/components/appointment-card";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { formatHourLabel, hourInTimeZone } from "@/features/calendar/display";
import { formatInTimeZone } from "@/lib/utils/timezone";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const WEEK_START_HOUR = 7;
const WEEK_END_HOUR = 20;

function dayNumber(dateStr: string) {
  return dateStr.split("-")[2];
}

function weekHours(): number[] {
  const hours: number[] = [];
  for (let hour = WEEK_START_HOUR; hour <= WEEK_END_HOUR; hour += 1) {
    hours.push(hour);
  }
  return hours;
}

export function WeekView({
  days,
  appointmentsByDay,
  timeZone,
  today,
  isAdmin = false,
  now,
  onSelect,
}: {
  days: string[];
  appointmentsByDay: Map<string, AppointmentRow[]>;
  timeZone: string;
  today: string;
  isAdmin?: boolean;
  now?: Date;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  const hours = weekHours();

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[16px] border border-border bg-card lg:block">
        <div
          className="min-w-[960px]"
          style={{
            display: "grid",
            gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="border-b border-border bg-card" />
          {days.map((day, index) => {
            const isToday = day === today;
            return (
              <div
                key={`head-${day}`}
                className={cn(
                  "border-b border-l border-border px-3 py-3",
                  isToday && "bg-sage-light/40",
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {WEEKDAY_LABELS[index]}
                </p>
                <p
                  className={cn(
                    "font-serif text-2xl font-bold",
                    isToday ? "text-sage-700" : "text-foreground",
                  )}
                >
                  {dayNumber(day)}
                </p>
              </div>
            );
          })}

          {hours.map((hour) => (
            <HourRow
              key={hour}
              hour={hour}
              days={days}
              today={today}
              appointmentsByDay={appointmentsByDay}
              timeZone={timeZone}
              now={now}
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
                <div className="flex flex-col gap-1.5">
                  {appointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      timeZone={timeZone}
                      isAdmin={isAdmin}
                      compact
                      now={now}
                      onClick={() => onSelect(appointment)}
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

function HourRow({
  hour,
  days,
  today,
  appointmentsByDay,
  timeZone,
  now,
  onSelect,
}: {
  hour: number;
  days: string[];
  today: string;
  appointmentsByDay: Map<string, AppointmentRow[]>;
  timeZone: string;
  now?: Date;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  return (
    <>
      <div className="border-t border-border px-2 py-2 text-right font-mono text-[11px] text-muted-foreground">
        {formatHourLabel(hour)}
      </div>
      {days.map((day) => {
        const slot = (appointmentsByDay.get(day) ?? []).filter(
          (appointment) => hourInTimeZone(appointment.starts_at, timeZone) === hour,
        );
        return (
          <div
            key={`${day}-${hour}`}
            className={cn(
              "min-h-[72px] border-l border-t border-border bg-background/40 p-1",
              day === today && "bg-sage-light/20",
            )}
          >
            <div className="flex flex-col gap-1">
              {slot.map((appointment) => (
                <WeekAppointmentChip
                  key={appointment.id}
                  appointment={appointment}
                  timeZone={timeZone}
                  now={now}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function WeekAppointmentChip({
  appointment,
  timeZone,
  now,
  onSelect,
}: {
  appointment: AppointmentRow;
  timeZone: string;
  now?: Date;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  const visual = getAppointmentVisualStatus(appointment, now);
  const starts = formatInTimeZone(appointment.starts_at, timeZone);
  const ends = formatInTimeZone(appointment.ends_at, timeZone);

  return (
    <button
      type="button"
      data-appointment-visual={visual.tone}
      data-appointment-origin={appointment.origin}
      style={visual.style}
      onClick={() => onSelect(appointment)}
      className={cn("w-full min-w-0 rounded-md px-2 py-1.5 text-left", visual.className)}
    >
      <p className="font-mono text-[10px] text-white/85">
        {starts} – {ends}
      </p>
      <p className="break-words text-xs font-semibold leading-snug text-white">
        {appointment.summary_snapshot ?? "Sem paciente"}
      </p>
    </button>
  );
}
