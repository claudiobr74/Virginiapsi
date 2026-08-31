import { TimedEventColumn, TimedHourGutter } from "@/features/calendar/components/timed-event-column";
import type { AppointmentRow } from "@/features/calendar/contracts";
import { summarizeDayAppointments } from "@/features/calendar/display";
import { agendaHourRange } from "@/features/calendar/event-layout";

export function DayView({
  appointments,
  timeZone,
  selectedId,
  onSelect,
}: {
  appointments: AppointmentRow[];
  timeZone: string;
  selectedId?: string | null;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  const summary = summarizeDayAppointments(appointments);
  const { startHour, endHour } = agendaHourRange(appointments, timeZone);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Consultas do dia"
          value={`${summary.total} ${summary.total === 1 ? "consulta" : "consultas"}`}
          hint="VirgíniaPsi e eventos externos visíveis"
        />
        <SummaryCard
          label="Confirmadas"
          value={`${summary.confirmed} ${summary.confirmed === 1 ? "confirmada" : "confirmadas"}`}
          hint="Status de confirmação no VirgíniaPsi"
        />
        <SummaryCard
          label="Agendadas"
          value={`${summary.scheduled} ${summary.scheduled === 1 ? "agendada" : "agendadas"}`}
          hint="Ainda sem confirmação"
        />
        <SummaryCard
          label="Eventos Google"
          value={`${summary.external} ${summary.external === 1 ? "externo" : "externos"}`}
          hint="Somente leitura no VirgíniaPsi"
        />
      </div>

      {appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem compromissos neste dia.</p>
      ) : null}

      <div className="overflow-hidden rounded-[16px] border border-border bg-card">
        <div
          className="grid"
          style={{ gridTemplateColumns: "3.5rem minmax(0, 1fr)" }}
        >
          <TimedHourGutter startHour={startHour} endHour={endHour} />
          <TimedEventColumn
            appointments={appointments}
            timeZone={timeZone}
            startHour={startHour}
            endHour={endHour}
            selectedId={selectedId}
            density="day"
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[16px] border border-border bg-card px-4 py-3.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-serif text-xl italic font-medium text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}
