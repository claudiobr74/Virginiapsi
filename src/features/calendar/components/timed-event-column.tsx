import type { AppointmentRow } from "@/features/calendar/contracts";
import { CalendarEventBlock, type CalendarEventDensity } from "@/features/calendar/components/calendar-event-block";
import {
  AGENDA_HOUR_HEIGHT_PX,
  layoutTimedEvents,
  timedEventPosition,
} from "@/features/calendar/event-layout";
import { formatHourLabel } from "@/features/calendar/display";
import { cn } from "@/lib/utils/cn";

export function TimedEventColumn({
  appointments,
  timeZone,
  startHour,
  endHour,
  selectedId,
  density,
  isToday = false,
  onSelect,
}: {
  appointments: AppointmentRow[];
  timeZone: string;
  startHour: number;
  endHour: number;
  selectedId?: string | null;
  density: Extract<CalendarEventDensity, "week" | "day">;
  isToday?: boolean;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  const hours = hourList(startHour, endHour);
  const totalHeight = (endHour - startHour) * AGENDA_HOUR_HEIGHT_PX;
  const laidOut = layoutTimedEvents(appointments, timeZone);

  return (
    <div
      className={cn(
        "relative overflow-hidden border-l border-border bg-background/40",
        isToday && "bg-sage-light/20",
      )}
      style={{ height: totalHeight }}
    >
      {hours.map((hour) => (
        <div
          key={hour}
          aria-hidden
          className="absolute inset-x-0 border-t border-border"
          style={{ top: (hour - startHour) * AGENDA_HOUR_HEIGHT_PX }}
        />
      ))}
      {laidOut.map((item) => {
        const position = timedEventPosition(item, startHour);
        return (
          <CalendarEventBlock
            key={item.appointment.id}
            appointment={item.appointment}
            timeZone={timeZone}
            density={density}
            selected={item.appointment.id === selectedId}
            onSelect={onSelect}
            style={{
              position: "absolute",
              top: position.top,
              height: position.height,
              left: position.left,
              width: position.width,
              zIndex: item.appointment.id === selectedId ? 2 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

export function TimedHourGutter({
  startHour,
  endHour,
}: {
  startHour: number;
  endHour: number;
}) {
  const hours = hourList(startHour, endHour);
  const totalHeight = (endHour - startHour) * AGENDA_HOUR_HEIGHT_PX;
  return (
    <div className="relative border-t border-border" style={{ height: totalHeight }}>
      {hours.map((hour) => (
        <p
          key={hour}
          className="absolute right-2 font-mono text-[11px] tabular-nums text-muted-foreground"
          style={{ top: (hour - startHour) * AGENDA_HOUR_HEIGHT_PX + 4 }}
        >
          {formatHourLabel(hour)}
        </p>
      ))}
    </div>
  );
}

function hourList(startHour: number, endHour: number): number[] {
  const hours: number[] = [];
  for (let hour = startHour; hour < endHour; hour += 1) {
    hours.push(hour);
  }
  return hours;
}
