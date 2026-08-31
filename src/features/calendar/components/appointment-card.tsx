import { CalendarEventBlock } from "@/features/calendar/components/calendar-event-block";
import type { AppointmentRow } from "@/features/calendar/contracts";

/** Compact Agenda block used in stacked (mobile week) lists. */
export function AppointmentCard({
  appointment,
  timeZone,
  density = "stack",
  selected = false,
  onSelect,
}: {
  appointment: AppointmentRow;
  timeZone: string;
  density?: "stack" | "day";
  selected?: boolean;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  return (
    <CalendarEventBlock
      appointment={appointment}
      timeZone={timeZone}
      density={density}
      selected={selected}
      onSelect={onSelect}
    />
  );
}
