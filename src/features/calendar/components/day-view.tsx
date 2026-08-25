import { AppointmentCard } from "@/features/calendar/components/appointment-card";
import type { AppointmentRow } from "@/features/calendar/contracts";
import {
  buildDayTimelineHours,
  formatHourLabel,
  hourInTimeZone,
  summarizeDayAppointments,
} from "@/features/calendar/display";

export function DayView({
  appointments,
  timeZone,
  isAdmin = false,
  onSelect,
}: {
  appointments: AppointmentRow[];
  timeZone: string;
  isAdmin?: boolean;
  onSelect: (appointment: AppointmentRow) => void;
}) {
  const summary = summarizeDayAppointments(appointments);
  const hours = buildDayTimelineHours(appointments, timeZone);
  const byHour = new Map<number, AppointmentRow[]>();
  for (const appointment of appointments) {
    const hour = hourInTimeZone(appointment.starts_at, timeZone);
    const list = byHour.get(hour) ?? [];
    list.push(appointment);
    byHour.set(hour, list);
  }

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

      <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
        {hours.map((hour) => {
          const slot = byHour.get(hour) ?? [];
          return (
            <div
              key={hour}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-border last:border-b-0 px-3 py-3 sm:px-4"
            >
              <p className="pt-1 text-right font-mono text-xs font-semibold text-muted-foreground">
                {formatHourLabel(hour)}
              </p>
              <div className="flex min-w-0 flex-col gap-2">
                {slot.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Sem compromissos agendados</p>
                ) : (
                  slot.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      timeZone={timeZone}
                      isAdmin={isAdmin}
                      onClick={() => onSelect(appointment)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
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
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-serif text-xl italic font-medium text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}
