import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { AppointmentCard } from "@/features/calendar/components/appointment-card";
import type { AppointmentRow } from "@/features/calendar/contracts";

export function DayView({
  appointments,
  timeZone,
  onSelect,
}: {
  appointments: AppointmentRow[];
  timeZone: string;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nenhuma consulta hoje"
        description="O dia está livre. Aproveite para organizar pendências ou crie uma nova consulta."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {appointments.map((appointment) => (
        <AppointmentCard
          key={appointment.id}
          appointment={appointment}
          timeZone={timeZone}
          onClick={() => onSelect(appointment)}
        />
      ))}
    </div>
  );
}
